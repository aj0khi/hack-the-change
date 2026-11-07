// VouchTrust.swift
// iOS counterpart of the web app's trust.mjs. Same token format, so a credential
// signed on the web verifies on the phone, and one signed on the phone verifies on the web.
//
// Token: compact JWS  base64url(header) . base64url(payload) . base64url(Ed25519 signature)
// Header: {"alg":"EdDSA","typ":"JWT"}
// Public key: base64url of the SPKI encoding (what trust.mjs exports), 12-byte prefix + 32 raw bytes.
// QR contents: "vouch:1:<token>" for a credential, "vouchkey:1:<issuer name>|<publicKeySPKI>" for an issuer.

import CryptoKit
import Foundation

nonisolated struct SkillMapping: Codable, Hashable, Sendable {
    let skill: String
    let quote: String
}

nonisolated struct VouchPayload: Codable, Hashable, Sendable {
    let title: String
    let witness: String
    let transcript: String
    let issuer: String
    let student: String
    let example: Bool
    let issuedAt: String
    let mappings: [SkillMapping]
}

nonisolated enum VouchTrustError: LocalizedError {
    case ungrounded, badKey
    var errorDescription: String? {
        switch self {
        case .ungrounded: return "Each skill needs an exact quote from the confirmed transcript."
        case .badKey: return "That issuer key is not a valid Ed25519 public key."
        }
    }
}

nonisolated enum VouchTrust {
    // DER prefix that turns a raw 32-byte Ed25519 key into SPKI (matches Web Crypto exportKey("spki")).
    private static let spkiPrefix = Data([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00])

    // MARK: Grounding (same rule as groundedMappings in trust.mjs)

    static func groundedMappings(transcript: String, mappings: [SkillMapping]) -> [SkillMapping] {
        mappings.filter { !$0.skill.isEmpty && !$0.quote.isEmpty && transcript.contains($0.quote) }
    }

    private static func isFullyGrounded(_ p: VouchPayload) -> Bool {
        !p.transcript.isEmpty && !p.mappings.isEmpty &&
            groundedMappings(transcript: p.transcript, mappings: p.mappings).count == p.mappings.count
    }

    // MARK: Keys

    static func publicKey(fromSPKI value: String) throws -> Curve25519.Signing.PublicKey {
        guard let der = base64URLDecode(value), der.count == 44, der.prefix(12) == spkiPrefix,
              let key = try? Curve25519.Signing.PublicKey(rawRepresentation: der.suffix(32))
        else { throw VouchTrustError.badKey }
        return key
    }

    static func spki(of key: Curve25519.Signing.PublicKey) -> String {
        base64URLEncode(spkiPrefix + key.rawRepresentation)
    }

    // MARK: Sign (phone acting as the issuing organization)

    static func sign(_ payload: VouchPayload, with key: Curve25519.Signing.PrivateKey) throws -> String {
        guard isFullyGrounded(payload) else { throw VouchTrustError.ungrounded }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let header = base64URLEncode(Data(#"{"alg":"EdDSA","typ":"JWT"}"#.utf8))
        let body = base64URLEncode(try encoder.encode(payload))
        let input = "\(header).\(body)"
        let signature = try key.signature(for: Data(input.utf8))
        return "\(input).\(base64URLEncode(signature))"
    }

    // MARK: Verify (employer scanning a QR)

    /// Returns the payload only if the signature matches one of the trusted issuer keys
    /// and every skill is backed by an exact quote. Any edit to the token returns nil.
    static func verify(_ token: String, trustedKeys: [Curve25519.Signing.PublicKey]) -> VouchPayload? {
        let parts = token.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3,
              let headerData = base64URLDecode(parts[0]),
              let header = try? JSONSerialization.jsonObject(with: headerData) as? [String: Any],
              header["alg"] as? String == "EdDSA", header["typ"] as? String == "JWT",
              let signature = base64URLDecode(parts[2]),
              let bodyData = base64URLDecode(parts[1])
        else { return nil }
        let input = Data("\(parts[0]).\(parts[1])".utf8)
        guard trustedKeys.contains(where: { $0.isValidSignature(signature, for: input) }),
              let payload = try? JSONDecoder().decode(VouchPayload.self, from: bodyData),
              isFullyGrounded(payload)
        else { return nil }
        return payload
    }

    /// Same as alterCredential in trust.mjs: edits the transcript but keeps the old signature.
    static func alter(_ token: String) -> String {
        var parts = token.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 3, let body = base64URLDecode(parts[1]),
              var json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              let transcript = json["transcript"] as? String
        else { return token + "x" }
        json["transcript"] = transcript + " (edited)"
        guard let edited = try? JSONSerialization.data(withJSONObject: json) else { return token + "x" }
        parts[1] = base64URLEncode(edited)
        return parts.joined(separator: ".")
    }

    // MARK: QR helpers

    static func credentialQR(_ token: String) -> String { "vouch:1:\(token)" }

    static func token(fromQR text: String) -> String? {
        text.hasPrefix("vouch:1:") ? String(text.dropFirst(8)) : nil
    }

    static func issuerQR(name: String, key: Curve25519.Signing.PublicKey) -> String {
        "vouchkey:1:\(name)|\(spki(of: key))"
    }

    static func issuer(fromQR text: String) -> (name: String, key: Curve25519.Signing.PublicKey)? {
        guard text.hasPrefix("vouchkey:1:") else { return nil }
        let rest = text.dropFirst(11)
        guard let bar = rest.lastIndex(of: "|"),
              let key = try? publicKey(fromSPKI: String(rest[rest.index(after: bar)...]))
        else { return nil }
        return (String(rest[..<bar]), key)
    }

    // MARK: base64url

    static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func base64URLDecode(_ value: String) -> Data? {
        var s = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        s += String(repeating: "=", count: (4 - s.count % 4) % 4)
        return Data(base64Encoded: s)
    }
}

// MARK: - Keychain storage for the issuer's private key (the iPad acting as the centre)

nonisolated enum IssuerKeyStore {
    private static let account = "vouch-issuer-ed25519"

    static func loadOrCreate() throws -> Curve25519.Signing.PrivateKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data {
            return try Curve25519.Signing.PrivateKey(rawRepresentation: data)
        }
        let key = Curve25519.Signing.PrivateKey()
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecValueData as String: key.rawRepresentation,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        SecItemAdd(add as CFDictionary, nil)
        return key
    }
}
