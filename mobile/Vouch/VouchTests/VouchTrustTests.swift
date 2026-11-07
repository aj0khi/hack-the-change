// VouchTrustTests.swift — add to your iOS test target.
// The token below was signed by the web app's own trust.mjs, so passing these tests
// proves the phone and the website agree on the format.

import CryptoKit
import Foundation
import XCTest
@testable import Vouch   // change to your app module name

final class VouchTrustTests: XCTestCase {
    let webKey = "MCowBQYDK2VwAyEAsXYPTadCZ2fS328luqh-BgRZKUqBZNofhK7FlwnmMcw"
    let webToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ0cmFuc2NyaXB0IjoiUHJpeWEgd2FzIHBhdGllbnQgYW5kIGV4cGxhaW5lZCBldmVyeSBzdGVwIGNsZWFybHkuIiwidGl0bGUiOiJIZWxwIG5laWdoYm91cnMgY29ubmVjdCBvbmxpbmUiLCJ3aXRuZXNzIjoiRG91ZyIsImlzc3VlciI6IkNvbW11bml0eSBDZW50cmUgKGZpY3Rpb25hbCBkZW1vKSIsInN0dWRlbnQiOiJQcml5YSBTaGFybWEiLCJleGFtcGxlIjp0cnVlLCJpc3N1ZWRBdCI6IjIwMjYtMTEtMDciLCJtYXBwaW5ncyI6W3sic2tpbGwiOiJDb21tdW5pY2F0aW9uIiwicXVvdGUiOiJleHBsYWluZWQgZXZlcnkgc3RlcCBjbGVhcmx5In1dfQ.-rY6dXtwKEGJBvuKyGSK1QyH9BJc_C8POXdDSnmXHeilTML6sefWVYTXIxam1jtKaIS1E36591sDH4EFRR41CA"
    let tamperedToken = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ0cmFuc2NyaXB0IjoiUHJpeWEgd2FzIHBhdGllbnQgYW5kIGV4cGxhaW5lZCBldmVyeSBzdGVwIGNsZWFybHkuIChlZGl0ZWQpIiwidGl0bGUiOiJIZWxwIG5laWdoYm91cnMgY29ubmVjdCBvbmxpbmUiLCJ3aXRuZXNzIjoiRG91ZyIsImlzc3VlciI6IkNvbW11bml0eSBDZW50cmUgKGZpY3Rpb25hbCBkZW1vKSIsInN0dWRlbnQiOiJQcml5YSBTaGFybWEiLCJleGFtcGxlIjp0cnVlLCJpc3N1ZWRBdCI6IjIwMjYtMTEtMDciLCJtYXBwaW5ncyI6W3sic2tpbGwiOiJDb21tdW5pY2F0aW9uIiwicXVvdGUiOiJleHBsYWluZWQgZXZlcnkgc3RlcCBjbGVhcmx5In1dfQ.-rY6dXtwKEGJBvuKyGSK1QyH9BJc_C8POXdDSnmXHeilTML6sefWVYTXIxam1jtKaIS1E36591sDH4EFRR41CA"

    func testWebCredentialVerifiesOnPhone() throws {
        let key = try VouchTrust.publicKey(fromSPKI: webKey)
        let payload = try XCTUnwrap(VouchTrust.verify(webToken, trustedKeys: [key]))
        XCTAssertEqual(payload.witness, "Doug")
        XCTAssertEqual(payload.mappings.first?.skill, "Communication")
    }

    func testTamperedCredentialFails() throws {
        let key = try VouchTrust.publicKey(fromSPKI: webKey)
        XCTAssertNil(VouchTrust.verify(tamperedToken, trustedKeys: [key]))
    }

    func testWrongIssuerFails() {
        let stranger = Curve25519.Signing.PrivateKey().publicKey
        XCTAssertNil(VouchTrust.verify(webToken, trustedKeys: [stranger]))
    }

    func testPhoneSignedCredentialRoundTrips() throws {
        let key = Curve25519.Signing.PrivateKey()
        let payload = VouchPayload(title: "Help neighbours connect online", witness: "Doug",
            transcript: "She was so patient and wrote the steps down for me.",
            issuer: "Community Centre (fictional demo)", student: "Priya Sharma", example: false,
            issuedAt: "2026-11-07", mappings: [SkillMapping(skill: "Communication", quote: "She was so patient")])
        let token = try VouchTrust.sign(payload, with: key)
        XCTAssertEqual(VouchTrust.verify(token, trustedKeys: [key.publicKey]), payload)
        // SPKI export must round-trip, so the web app can import this key
        XCTAssertNotNil(try? VouchTrust.publicKey(fromSPKI: VouchTrust.spki(of: key.publicKey)))
    }

    func testUngroundedQuoteIsRefused() {
        let payload = VouchPayload(title: "t", witness: "Doug", transcript: "A different transcript",
            issuer: "i", student: "s", example: false, issuedAt: "2026-11-07",
            mappings: [SkillMapping(skill: "Digital", quote: "invented praise")])
        XCTAssertThrowsError(try VouchTrust.sign(payload, with: Curve25519.Signing.PrivateKey()))
    }

    func testQRParsing() throws {
        XCTAssertEqual(VouchTrust.token(fromQR: VouchTrust.credentialQR(webToken)), webToken)
        let key = try VouchTrust.publicKey(fromSPKI: webKey)
        let issuer = try XCTUnwrap(VouchTrust.issuer(fromQR: VouchTrust.issuerQR(name: "Community Centre", key: key)))
        XCTAssertEqual(issuer.name, "Community Centre")
    }

    // MARK: Ported web behaviour

    func testExampleTranscriptSplitsIntoExactSentences() {
        let transcript = DemoData.examplePayload.transcript
        let sentences = DemoData.sentences(in: transcript)
        XCTAssertEqual(sentences.count, 2)
        XCTAssertTrue(sentences.allSatisfy { transcript.contains($0) }, "Every sentence must be usable as an exact quote")
    }

    private func exampleCredential() throws -> VerifiedCredential {
        let key = Curve25519.Signing.PrivateKey()
        let token = try VouchTrust.sign(DemoData.examplePayload, with: key)
        return VerifiedCredential(id: 0, token: token, payload: DemoData.examplePayload, verifiedBy: "test")
    }

    /// Expected rows come from running app.js's keywordLens on the same example (Node, 2026-11-07).
    func testKeywordLensMatchesTheWebExampleJob() throws {
        let rows = EmployerLens.keywordLens(posting: DemoData.exampleJob, credentials: [try exampleCredential()])
        XCTAssertEqual(rows.count, 15)
        let matched = rows.filter { !$0.matches.isEmpty }.map { "\($0.id):\($0.matches[0].label)" }
        XCTAssertEqual(matched, ["1:Digital", "4:Communication", "5:Digital", "7:Communication", "9:Digital"])
        XCTAssertTrue(rows[0].requirement.hasPrefix("Client Support Coordinator (Junior)"))
        XCTAssertEqual(rows[8].requirement, "Experience writing clear instructions or documentation.")
        XCTAssertEqual(rows[8].suggestions.map(\.title), ["Create a simple digital guide", "Write the monthly newsletter"])
        XCTAssertEqual(rows[8].suggestions.first?.why, "Practises writing.")
        XCTAssertTrue(rows[11].matches.isEmpty)   // driver's licence: an honest gap
        XCTAssertTrue(rows.allSatisfy { $0.keywordBased })
    }

    func testCatalogMatchesTheWebProjects() {
        XCTAssertEqual(DemoData.projects.map(\.id), ["video-calls", "signup-sheet", "digital-guide", "volunteer-database",
                                                    "tech-help-hour", "event-check-in", "newsletter", "newcomer-setup"])
        XCTAssertTrue(DemoData.projects.allSatisfy { $0.skills.allSatisfy { DemoData.skills.contains($0) } })
    }

    /// The phone re-checks AI answers: unknown credentials and paraphrased quotes are dropped,
    /// and only catalog projects are suggested, only for soft/technical gaps.
    func testAILensAnswerIsGroundedOnThePhone() throws {
        let credential = try exampleCredential()
        let json = """
        {"requirements":[
          {"text":"Explain technical steps","kind":"soft","matches":[
            {"credentialId":"0","quote":"Priya was patient and explained every step clearly.","evidenceType":"praise","why":"w"},
            {"credentialId":"0","quote":"Priya explained everything perfectly.","evidenceType":"action","why":"made up"},
            {"credentialId":"7","quote":"Priya was patient","evidenceType":"action","why":"no such credential"}]},
          {"text":"Comfort with spreadsheets","kind":"technical","matches":[],
           "suggestedProjects":[{"projectId":"signup-sheet","why":"Practise sheets"},{"projectId":"invented","why":"x"}]},
          {"text":"Class 5 licence","kind":"credential","matches":[],"suggestedProjects":[{"projectId":"newsletter","why":"no"}]}],
         "rejected":[{"requirement":"r","credentialId":"0","quote":"q","reason":"server said no"}],
         "stats":{"validCredentials":1},"model":"test-model"}
        """
        let response = try JSONDecoder().decode(LensResponse.self, from: Data(json.utf8))
        let submission = LensSubmission(tokens: [credential.token], credentialIDs: [credential.id], publicKeySPKI: "k")
        let outcome = try LensAPI.outcome(from: response, submission: submission, credentials: [credential])
        XCTAssertEqual(outcome.mode, .ai)
        XCTAssertEqual(outcome.rows.count, 3)
        XCTAssertEqual(outcome.rows[0].matches.map(\.quote), ["Priya was patient and explained every step clearly."])
        XCTAssertEqual(outcome.rows[0].matches.first?.witness, "Doug")
        XCTAssertEqual(outcome.rejected.count, 3)   // 1 from the server + 2 caught on the phone
        XCTAssertEqual(outcome.rows[1].suggestions.map(\.title), ["Make a community spreadsheet easier"])
        XCTAssertTrue(outcome.rows[2].suggestions.isEmpty)
        XCTAssertEqual(outcome.matchedCount, 1)
    }

    func testFallbackAnswerUsesTheOfflineLens() throws {
        let response = try JSONDecoder().decode(LensResponse.self, from: Data(#"{"fallback":true,"reason":"No model configured"}"#.utf8))
        let submission = LensSubmission(tokens: [], credentialIDs: [], publicKeySPKI: "k")
        XCTAssertThrowsError(try LensAPI.outcome(from: response, submission: submission, credentials: []))
    }

    func testDemandLinePicksTheMostAskedForSkill() {
        let demand = SkillDemand(total: 30, counts: ["Communication": 12, "Digital": 20, "Writing": 0])
        XCTAssertEqual(EmployerLens.demandLine(for: ["Communication", "Digital"], demand: demand),
                       "Builds Digital: mentioned in 20 of 30 Calgary posting excerpts (Adzuna)")
        XCTAssertNil(EmployerLens.demandLine(for: ["Writing"], demand: demand))
        XCTAssertNil(EmployerLens.demandLine(for: ["Digital"], demand: nil))
    }

    func testAlterBreaksTheSignature() throws {
        let key = Curve25519.Signing.PrivateKey()
        let token = try VouchTrust.sign(DemoData.examplePayload, with: key)
        XCTAssertNotNil(VouchTrust.verify(token, trustedKeys: [key.publicKey]))
        XCTAssertNil(VouchTrust.verify(VouchTrust.alter(token), trustedKeys: [key.publicKey]))
    }

    func testWebTokenAlteredOnPhoneFailsOnPhone() throws {
        let key = try VouchTrust.publicKey(fromSPKI: webKey)
        XCTAssertNil(VouchTrust.verify(VouchTrust.alter(webToken), trustedKeys: [key]))
    }
}
