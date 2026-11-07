// VerificationView.swift — the web "Account verification" section, plus the small client for the
// website's server (Badgr lookup and account-verification config) shared with the Employer lens.
//
// Sign-in (Auth0), ID checks (Stripe Identity) and organization review need the website's session,
// so the phone shows the same three steps and status, then continues the flow on the website
// in an in-app browser. No account data is stored on the phone.

import Foundation
import SwiftUI
import UIKit

// MARK: - Website server

nonisolated enum ProoflyServer {
    /// The deployed website. Its server exposes /api/config and /api/badgr/assertion.
    static let baseURL = URL(string: "https://lightgreen-spider-627340.hostingersite.com")!
    static let verificationPage = URL(string: "https://lightgreen-spider-627340.hostingersite.com/#verification")!

    nonisolated struct Config: Decodable, Sendable {
        let enabled: Bool
        let identityEnabled: Bool
    }

    nonisolated struct BadgeResult: Decodable, Sendable {
        let status: String?
        let badgeName: String?
        let error: String?
    }

    nonisolated enum BadgeRegion: String, CaseIterable, Identifiable, Sendable {
        case canada, us, legacy
        var id: String { rawValue }
        var label: String {
            switch self {
            case .canada: "Canada"
            case .us: "United States"
            case .legacy: "Legacy Badgr.io"
            }
        }
    }

    static func config() async throws -> Config {
        var request = URLRequest(url: baseURL.appending(path: "api/config"), timeoutInterval: 10)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Config.self, from: data)
    }

    /// Same request and messages as the website's badge lookup form in app.js.
    static func lookUpBadge(region: BadgeRegion, assertionID: String) async -> String {
        var request = URLRequest(url: baseURL.appending(path: "api/badgr/assertion"), timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["region": region.rawValue, "assertionId": assertionID])
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let result = try JSONDecoder().decode(BadgeResult.self, from: data)
            if let error = result.error { return error }
            var message = switch result.status {
            case "found": "Provider record found. Recipient ownership and issuer trust are not verified."
            case "revoked": "The provider reports that this assertion is revoked."
            case "expired": "This assertion has expired."
            case "not_found": "No public assertion was found in this region."
            default: "The badge status could not be determined."
            }
            if result.status == "found", let name = result.badgeName { message += " Badge: \(name)." }
            return message
        } catch {
            return "Badge lookup unavailable."
        }
    }

    /// Assertion IDs allowed by the website form: letters, digits, _ and -, up to 128 characters.
    static func isValidAssertionID(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 128 && value.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }
    }
}

// MARK: - Employer lens: 03 / Public badge record

struct BadgeLookupCard: View {
    @State private var region: ProoflyServer.BadgeRegion = .canada
    @State private var assertionID = ""
    @State private var result: String?
    @State private var isChecking = false

    private var trimmedID: String { assertionID.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CardLabel(left: "03 / Public badge record")
            Text("Look up a Badgr badge")
                .font(.display(20, relativeTo: .title2)).foregroundStyle(VColor.ink)
                .padding(.top, 20)
                .accessibilityAddTraits(.isHeader)
            Text("Check the status of a publicly shared hosted assertion on Badgr / Parchment Digital Badges.")
                .font(.text(13)).foregroundStyle(VColor.verificationBody).padding(.top, 7)

            FieldLabel(text: "Provider region").padding(.top, 18)
            Menu {
                Picker("Provider region", selection: $region) {
                    ForEach(ProoflyServer.BadgeRegion.allCases) { Text($0.label).tag($0) }
                }
            } label: {
                HStack {
                    Text(region.label).foregroundStyle(VColor.ink)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").foregroundStyle(VColor.arrowIcon)
                }
                .vField()
            }
            .accessibilityLabel("Provider region, \(region.label)")
            .padding(.top, 6)

            FieldLabel(text: "Assertion ID").padding(.top, 14)
            TextField("e.g. abc123", text: $assertionID)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .vField()
                .padding(.top, 6)
                .onSubmit { Task { await lookUp() } }

            Button {
                Task { await lookUp() }
            } label: {
                Label("Look up badge", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
            }
            .buttonStyle(.vPrimary)
            .disabled(isChecking || !ProoflyServer.isValidAssertionID(trimmedID))
            .opacity(isChecking ? 0.5 : 1)
            .padding(.top, 14)

            Text("This checks the provider's public record, expiry and revocation only. It does not verify recipient ownership, issuer trust, signatures, or complete Open Badges compliance. Do not use it as a hiring decision.")
                .font(.text(13)).foregroundStyle(VColor.verificationBody).padding(.top, 18)

            if let result {
                Text(result)
                    .font(.text(14)).foregroundStyle(Color(hex: 0x344E3E))
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(hex: 0xEEF3ED), in: .rect(cornerRadius: 4))
                    .padding(.top, 14)
            }
        }
        .vCard(border: VColor.line, padding: 22)
    }

    private func lookUp() async {
        guard ProoflyServer.isValidAssertionID(trimmedID), !isChecking else { return }
        isChecking = true
        result = "Checking the provider’s public record…"
        let message = await ProoflyServer.lookUpBadge(region: region, assertionID: trimmedID)
        result = message
        isChecking = false
        UIAccessibility.post(notification: .announcement, argument: message)
    }
}

// MARK: - Account verification section

struct VerificationView: View {
    @State private var accountStatus = "Checking account service…"
    @State private var serviceEnabled = false
    @State private var organization = OrganizationDetails()

    var body: some View {
        VPage {
            PageHeading(overline: "Trust starts here", title: "Make your identity count",
                        subtitle: "Verify your account and request a review for your organization.",
                        badge: ("Account security", "checkmark.shield"))

            VStack(spacing: 14) {
                VerificationPanel(number: "01", label: "Account", title: "Sign in securely.",
                                  text: "Use your own account and verify your email address. Your contact details are not public.") {
                    StatusBox(text: accountStatus)
                    if serviceEnabled {
                        Link(destination: ProoflyServer.verificationPage) {
                            Label("Sign in or create account", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
                        }
                        .buttonStyle(.vPrimary)
                        .padding(.top, 14)
                    }
                }

                VerificationPanel(number: "02", label: "Identity", title: "Verify your identity.",
                                  text: "Stripe handles your government ID and matching selfie. Proofly does not upload or store your licence image or number.") {
                    StatusBox(text: "Sign in to get started.")
                    HStack(spacing: 8) {
                        Button {} label: {
                            Label("Verify with Stripe", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
                        }
                        .buttonStyle(.vPrimary)
                        Button("Refresh status") {}.buttonStyle(.vSubtle)
                    }
                    .disabled(true)
                    .opacity(0.48)
                    .padding(.top, 14)
                    Text("A verified ID is not a guarantee of truth or a unique person. Duplicate identity review is a separate step.")
                        .font(.text(11, relativeTo: .caption)).foregroundStyle(VColor.verificationBody).padding(.top, 12)
                }

                VerificationPanel(number: "03", label: "Organization", title: "Request organization review.",
                                  text: "We need independently checkable details. Submitting them does not automatically verify the organization or your affiliation.") {
                    OrganizationForm(details: $organization)
                    StatusBox(text: "No organization review requested.")
                }
            }
            .padding(.top, 28)

            VerificationAside().padding(.top, 20)
        }
        .task { await loadConfig() }
        // Open website links in the in-app browser so sign-in and Stripe stay inside the app.
        .environment(\.openURL, OpenURLAction { .systemAction($0, prefersInApp: true) })
    }

    /// Mirrors initialize() in verification-ui.mjs.
    private func loadConfig() async {
        do {
            let config = try await ProoflyServer.config()
            serviceEnabled = config.enabled
            accountStatus = config.enabled
                ? "Sign in and verify your email to continue. Sign-in opens on the Proofly website."
                : "Account verification is not configured. Configure Auth0 to enable sign-in."
        } catch {
            serviceEnabled = false
            accountStatus = "Verification service is unavailable. Check your connection and try again."
        }
    }
}

nonisolated struct OrganizationDetails: Sendable {
    var name = ""
    var registry = ""
    var website = ""
    var email = ""
    var phone = ""
}

/// White numbered panel ("01 ACCOUNT").
private struct VerificationPanel<Content: View>: View {
    let number: String
    let label: String
    let title: String
    let text: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(number).font(.display(13, relativeTo: .footnote)).foregroundStyle(VColor.blue)
                Text(label.uppercased())
                    .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1)
                    .foregroundStyle(Color(hex: 0x788880))
            }
            .accessibilityElement(children: .combine)
            Text(title)
                .font(.display(20, relativeTo: .title2)).foregroundStyle(VColor.ink)
                .padding(.top, 14)
                .accessibilityAddTraits(.isHeader)
            Text(text).font(.text(13)).foregroundStyle(VColor.verificationBody).padding(.top, 8)
            content
        }
        .vCard(border: VColor.line, padding: 24)
    }
}

private struct StatusBox: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.text(13, relativeTo: .footnote)).foregroundStyle(Color(hex: 0x455F4C))
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(hex: 0xF0F4EE), in: .rect(cornerRadius: 4))
            .padding(.top, 16)
    }
}

/// Same fields as the website's organization form. Submitting needs a signed-in website session,
/// so the button opens the website's verification page instead of sending data from the phone.
private struct OrganizationForm: View {
    @Binding var details: OrganizationDetails

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            field("Legal organization name", text: $details.name, content: .organizationName)
            field("Registry number or public registry reference", text: $details.registry)
            field("Official website", text: $details.website, prompt: "https://", content: .URL, keyboard: .URL)
            field("Official contact email", text: $details.email, content: .emailAddress, keyboard: .emailAddress)
            field("Official contact phone", text: $details.phone, content: .telephoneNumber, keyboard: .phonePad)
            Link(destination: ProoflyServer.verificationPage) {
                Label("Sign in on the website to submit", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
            }
            .buttonStyle(.vPrimary)
            .padding(.top, 18)
        }
    }

    private func field(_ label: String, text: Binding<String>, prompt: String = "",
                       content: UITextContentType? = nil, keyboard: UIKeyboardType = .default) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: label)
            TextField(prompt, text: text)
                .textContentType(content)
                .keyboardType(keyboard)
                .textInputAutocapitalization(keyboard == .default ? .words : .never)
                .autocorrectionDisabled()
                .vField()
                .accessibilityLabel(label)
        }
        .padding(.top, 15)
    }
}

/// Green "More than a checkmark." panel.
private struct VerificationAside: View {
    private let layers = [
        ("Email ownership", "Can the account holder be reached?"),
        ("Government ID", "Did the identity provider verify the person?"),
        ("Organization review", "Are the registry, official contact, and staff affiliation confirmed independently?"),
        ("Duplicate and conflict checks", "Are the student, witness, and coordinator separate people?"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 15)).foregroundStyle(VColor.lensIcon)
                .frame(width: 34, height: 34).background(VColor.lensIconBackground, in: .rect(cornerRadius: 5))
                .accessibilityHidden(true)
            Overline(text: "Before a backing can be trusted").padding(.top, 20)
            Text("More than a checkmark.")
                .font(.display(20, relativeTo: .title2)).foregroundStyle(VColor.ink).padding(.top, 10)
            Text("Each layer answers a different question about the people and organization behind a backing.")
                .font(.text(13)).foregroundStyle(VColor.verificationBody).padding(.top, 8)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(layers, id: \.0) { title, detail in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(title).font(.text(14, weight: .bold)).foregroundStyle(VColor.ink)
                        Text(detail).font(.text(12, relativeTo: .caption)).foregroundStyle(VColor.verificationBody)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .top) { Rectangle().fill(Color(hex: 0xD5E0D5)).frame(height: 1) }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 14)
            DemoNotice(text: "Real verified backing issuance is not yet enabled. Existing signed credentials are fictional demos.")
                .padding(.top, 8)
        }
        .vCard(background: VColor.greenPanel, border: nil, padding: 24)
    }
}

#Preview {
    VerificationView()
}
