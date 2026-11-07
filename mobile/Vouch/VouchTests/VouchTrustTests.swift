// VouchTrustTests.swift — add to your iOS test target.
// The token below was signed by the web app's own trust.mjs, so passing these tests
// proves the phone and the website agree on the format.

import CryptoKit
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

    func testKeywordLensMatchesTheWebExampleJob() throws {
        let key = Curve25519.Signing.PrivateKey()
        let token = try VouchTrust.sign(DemoData.examplePayload, with: key)
        let credential = VerifiedCredential(id: 0, token: token, payload: DemoData.examplePayload, verifiedBy: "test")
        let rows = EmployerLens.keywordLens(posting: DemoData.exampleJob, credentials: [credential])
        XCTAssertEqual(rows.count, 4)
        XCTAssertEqual(rows[0].matches.first?.label, "Communication")   // communication and interpersonal
        XCTAssertEqual(rows[1].matches.first?.label, "Digital")         // digital tools and technology
        XCTAssertTrue(rows[2].matches.isEmpty)                          // project management: an honest gap
        XCTAssertTrue(rows[3].matches.isEmpty)                          // no problem-solving evidence signed
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
