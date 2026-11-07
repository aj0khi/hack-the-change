// VouchStore.swift
// The phone's equivalent of the web app's IndexedDB state: the issuer key (in the Keychain),
// signed credential tokens, and any other issuers this phone trusts (e.g. the web demo issuer).

import CryptoKit
import Foundation
import Observation

nonisolated struct TrustedIssuer: Codable, Hashable, Identifiable, Sendable {
    var id: String { publicKeySPKI }
    let name: String
    let publicKeySPKI: String
}

nonisolated struct VerifiedCredential: Identifiable, Hashable, Sendable {
    let id: Int          // position in the token list
    let token: String
    let payload: VouchPayload
    let verifiedBy: String
}

@Observable
final class VouchStore {
    private(set) var tokens: [String] = []
    private(set) var trustedIssuers: [TrustedIssuer] = []
    private(set) var startupError: String?
    private var issuerKey: Curve25519.Signing.PrivateKey?

    var issuerPublicKeySPKI: String? { issuerKey.map { VouchTrust.spki(of: $0.publicKey) } }

    /// "vouchkey:1:…" string other devices scan or paste to trust this phone's issuer.
    var issuerQR: String? {
        issuerKey.map { VouchTrust.issuerQR(name: DemoData.issuerName, key: $0.publicKey) }
    }

    nonisolated private struct SavedState: Codable {
        var tokens: [String]
        var trustedIssuers: [TrustedIssuer]
    }

    private var fileURL: URL {
        URL.applicationSupportDirectory.appending(path: "vouch-state.json")
    }

    init() {
        do {
            issuerKey = try IssuerKeyStore.loadOrCreate()
        } catch {
            startupError = "Could not create the signing key: \(error.localizedDescription)"
        }
        load()
        if tokens.isEmpty, let key = issuerKey, let token = try? VouchTrust.sign(DemoData.examplePayload, with: key) {
            tokens = [token]
            save()
        }
    }

    // MARK: Reading

    /// Only credentials whose signature checks out against a trusted key. Invalid ones are hidden, as on the web.
    var verified: [VerifiedCredential] {
        tokens.enumerated().compactMap { index, token in
            guard let result = check(token) else { return nil }
            return VerifiedCredential(id: index, token: token, payload: result.payload, verifiedBy: result.issuer)
        }
    }

    /// Returns the payload and the name of the issuer whose key verified it.
    func check(_ token: String) -> (payload: VouchPayload, issuer: String)? {
        if let key = issuerKey, let payload = VouchTrust.verify(token, trustedKeys: [key.publicKey]) {
            return (payload, "This phone (\(DemoData.issuerName))")
        }
        for issuer in trustedIssuers {
            if let key = try? VouchTrust.publicKey(fromSPKI: issuer.publicKeySPKI),
               let payload = VouchTrust.verify(token, trustedKeys: [key]) {
                return (payload, issuer.name)
            }
        }
        return nil
    }

    // MARK: Writing

    func issue(_ payload: VouchPayload) throws {
        guard let key = issuerKey else { throw VouchTrustError.badKey }
        let token = try VouchTrust.sign(payload, with: key)
        tokens.append(token)
        save()
    }

    enum ImportResult: Equatable {
        case trustedIssuer(String)
        case credential(String)
        case alreadyHave
        case notValid
        case unrecognized
    }

    /// Accepts a credential ("vouch:1:<token>" or a bare token) or an issuer ("vouchkey:1:<name>|<key>").
    func importText(_ text: String) -> ImportResult {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let issuer = VouchTrust.issuer(fromQR: value) {
            let trusted = TrustedIssuer(name: issuer.name, publicKeySPKI: VouchTrust.spki(of: issuer.key))
            if !trustedIssuers.contains(trusted) { trustedIssuers.append(trusted); save() }
            return .trustedIssuer(issuer.name)
        }
        let token = VouchTrust.token(fromQR: value) ?? value
        guard token.split(separator: ".").count == 3 else { return .unrecognized }
        if tokens.contains(token) { return .alreadyHave }
        guard let result = check(token) else { return .notValid }
        tokens.append(token)
        save()
        return .credential(result.payload.title)
    }

    func resetDemo() {
        tokens = []
        trustedIssuers = []
        if let key = issuerKey, let token = try? VouchTrust.sign(DemoData.examplePayload, with: key) {
            tokens = [token]
        }
        save()
    }

    // MARK: Persistence

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let state = try? JSONDecoder().decode(SavedState.self, from: data) else { return }
        tokens = state.tokens
        trustedIssuers = state.trustedIssuers
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(at: URL.applicationSupportDirectory, withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(SavedState(tokens: tokens, trustedIssuers: trustedIssuers))
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
        } catch {
            startupError = "Could not save credentials: \(error.localizedDescription)"
        }
    }
}
