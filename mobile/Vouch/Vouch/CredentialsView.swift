// CredentialsView.swift — the web "My credentials" section and its "Look closer" dialog,
// plus QR sharing and importing so the phone and the web app can exchange credentials.

import Foundation
import SwiftUI
import UIKit

struct CredentialsView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab
    @State private var showImport = false
    @State private var showIssuerKey = false
    @State private var confirmReset = false

    var body: some View {
        let verified = store.verified
        VPage {
            PageHeading(overline: "More than a line on a résumé", title: "Your work, vouched for",
                        subtitle: "Every credential connects a skill to the person behind the proof.")
            Button("Create a demo vouch") { selection = .vouch }
                .buttonStyle(.vPrimaryWide)
                .padding(.top, 20).padding(.bottom, 28)

            VStack(spacing: 12) {
                if verified.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("No valid signed credentials yet.").font(.display(17, bold: true, relativeTo: .headline))
                        Text("Create a demo vouch to get started.").font(.text(14)).foregroundStyle(VColor.credentialMeta)
                    }
                    .vCard(padding: 23)
                }
                ForEach(verified.reversed()) { CredentialCard(credential: $0) }
            }

            TrustLayerPanel().padding(.top, 20)

            VStack(alignment: .leading, spacing: 8) {
                CardLabel(left: "Share and import")
                HStack(spacing: 8) {
                    Button("Import", systemImage: "square.and.arrow.down") { showImport = true }
                        .buttonStyle(.vSubtle)
                    Button("Issuer key", systemImage: "key") { showIssuerKey = true }
                        .buttonStyle(.vSubtle)
                }
                Button("Reset demo data") { confirmReset = true }
                    .buttonStyle(.vLink)
            }
            .padding(.top, 24)
        }
        .sheet(isPresented: $showImport) { ImportSheet() }
        .sheet(isPresented: $showIssuerKey) { IssuerKeySheet() }
        .confirmationDialog("Reset demo data?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset", role: .destructive) { store.resetDemo() }
        } message: {
            Text("This removes your demo credentials and trusted issuers, then re-creates the fictional example.")
        }
    }
}

private struct CredentialCard: View {
    let credential: VerifiedCredential

    var body: some View {
        let payload = credential.payload
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 13) {
                BadgeSymbol()
                VStack(alignment: .leading, spacing: 4) {
                    Text(payload.title).font(.display(18, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    Text("\(payload.issuer) · \(payload.issuedAt) · Demo").font(.text(13)).foregroundStyle(VColor.credentialMeta)
                }
            }
            VerifiedBadge().padding(.top, 12)
            QuoteBlock(text: payload.transcript,
                       attribution: "— \(payload.witness), community member · \(payload.example ? "fictional example" : "demo entry")")
                .padding(.vertical, 18)
            FlowLayout(spacing: 6) {
                ForEach(payload.mappings.map(\.skill).uniqued(), id: \.self) { SkillChip(skill: $0) }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("EVIDENCE ATTACHED · LOCAL DEMO")
                    .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1).foregroundStyle(VColor.cardLabel)
                NavigationLink(value: credential) {
                    Label("View credential", systemImage: "arrow.up.right")
                        .labelStyle(TrailingIconLabel())
                        .font(.text(13, weight: .bold, relativeTo: .footnote))
                        .foregroundStyle(VColor.blue)
                        .frame(minHeight: 44)
                }
            }
            .padding(.top, 20)
        }
        .vCard(border: VColor.line, padding: 20)
    }
}

/// Green "THE TRUST LAYER" explainer panel.
private struct TrustLayerPanel: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Overline(text: "The trust layer", color: VColor.greenPanelKicker)
            Text("Proof you can look closer at.")
                .font(.display(25, relativeTo: .title)).foregroundStyle(VColor.greenPanelText)
                .padding(.top, 22)
            Text("Each credential is signed using a demo issuer key stored on this device. Editing its contents breaks the signature.")
                .font(.text(14)).foregroundStyle(VColor.greenPanelBody).lineSpacing(4).padding(.top, 11)
            VStack(alignment: .leading, spacing: 11) {
                item("Signed with Ed25519", "signature")
                item("Quotes checked against the transcript", "text.quote")
                item("No account or personal data sent", "lock")
            }
            .padding(.vertical, 20)
            Rectangle().fill(Color(hex: 0xD5E0D5)).frame(height: 1)
            Text("DEMO ONLY · NOT AN OPEN BADGE")
                .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1)
                .foregroundStyle(Color(hex: 0x8BA08E)).padding(.top, 16)
        }
        .vCard(background: VColor.greenPanel, border: nil, padding: 24)
    }

    private func item(_ text: String, _ icon: String) -> some View {
        Label(text, systemImage: icon)
            .labelStyle(TintedIconLabel(iconColor: VColor.greenPanelIcon))
            .font(.text(14, weight: .medium))
            .foregroundStyle(VColor.greenPanelText)
    }
}

/// The web's "Look closer" credential dialog, as a pushed page.
struct CredentialDetailView: View {
    @Environment(VouchStore.self) private var store
    let credential: VerifiedCredential
    @State private var editableToken = ""
    @State private var verifyMessage = ""
    @State private var verifyPassed: Bool?

    var body: some View {
        let payload = credential.payload
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Overline(text: "Look closer")
                Text("Credential details").font(.display(26, relativeTo: .title)).foregroundStyle(VColor.ink)
                    .padding(.top, 8).padding(.bottom, 20)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 7) {
                    Text(payload.title).font(.display(18, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    detail("Issuer", "\(payload.issuer) · demo identity")
                    detail("Verified by", credential.verifiedBy)
                    detail("Witness", "\(payload.witness) \(payload.example ? "(fictional example)" : "(demo entry)")")
                    detail("Student", payload.student)
                    detail("Issued", payload.issuedAt)
                }
                .padding(18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(VColor.dialogDetail, in: .rect(cornerRadius: 4))

                QuoteBlock(text: payload.transcript).padding(.vertical, 18)

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(payload.mappings, id: \.self) { mapping in
                        VStack(alignment: .leading, spacing: 6) {
                            SkillChip(skill: mapping.skill)
                            Text("“\(mapping.quote)”").font(.text(14)).foregroundStyle(VColor.resultText)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    CardLabel(left: "Share")
                    QRCodeView(text: VouchTrust.credentialQR(credential.token), label: "QR code for this credential")
                        .frame(maxWidth: .infinity)
                    ShareLink(item: VouchTrust.credentialQR(credential.token)) {
                        Label("Share credential", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.vSubtle)
                    Text("Another device can verify this only if it trusts this phone's issuer key.")
                        .font(.text(12)).foregroundStyle(VColor.hint)
                }
                .vCard(padding: 20)
                .padding(.top, 24)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Try the tamper test").font(.display(18, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    Text("Change a character, then check its signature.")
                        .font(.text(14)).foregroundStyle(VColor.bodyText)
                    Text("SIGNED CREDENTIAL (JWS)")
                        .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1).foregroundStyle(VColor.fieldLabel)
                    Text(editableToken)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(VColor.ink)
                        .lineLimit(7)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .vField()
                    HStack(spacing: 8) {
                        Button("Change a character") {
                            editableToken = VouchTrust.alter(editableToken)
                            verifyMessage = "Credential changed. Check its signature."
                            verifyPassed = nil
                        }
                        .buttonStyle(.vSubtle)
                        Button("Verify signature") {
                            let ok = store.check(editableToken) != nil
                            verifyPassed = ok
                            verifyMessage = ok
                                ? "Signature valid against a trusted issuer key."
                                : "Not valid: the signature does not match the credential or any trusted key."
                            UIAccessibility.post(notification: .announcement, argument: verifyMessage)
                        }
                        .buttonStyle(.vPrimary)
                    }
                    if !verifyMessage.isEmpty {
                        Text(verifyMessage)
                            .font(.text(14, weight: .bold))
                            .foregroundStyle(verifyPassed == false ? VColor.invalidText : verifyPassed == true ? VColor.verifiedText : VColor.noticeText)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(verifyPassed == false ? VColor.invalidBackground : verifyPassed == true ? VColor.verifiedBackground : VColor.noticeBackground,
                                        in: .rect(cornerRadius: 4))
                    }
                    if editableToken != credential.token {
                        Button("Restore original") {
                            editableToken = credential.token
                            verifyMessage = ""
                            verifyPassed = nil
                        }
                        .buttonStyle(.vLink)
                    }
                }
                .vCard(padding: 20)
                .padding(.top, 14)
            }
            .padding(18)
        }
        .background(VColor.paper)
        .navigationTitle("Credential")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .onAppear { if editableToken.isEmpty { editableToken = credential.token } }
    }

    private func detail(_ label: String, _ value: String) -> some View {
        (Text("\(label): ").fontWeight(.bold).foregroundStyle(VColor.ink) + Text(value).foregroundStyle(Color(hex: 0x7D8F83)))
            .font(.text(14))
    }
}

private struct ImportSheet: View {
    @Environment(VouchStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var message = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Paste vouch:1:… or vouchkey:1:…", text: $text, axis: .vertical)
                        .font(.system(.body, design: .monospaced))
                        .lineLimit(4...10)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Paste from clipboard") { text = UIPasteboard.general.string ?? "" }
                } footer: {
                    Text("Trust an issuer first (vouchkey:1:…), then import credentials it signed.")
                }
                if !message.isEmpty { Section { Text(message).font(.headline) } }
            }
            .navigationTitle("Import")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") {
                        switch store.importText(text) {
                        case .trustedIssuer(let name): message = "Now trusting \(name)."
                        case .credential(let title): message = "Imported and verified: \(title)."
                        case .alreadyHave: message = "You already have this credential."
                        case .notValid: message = "Not valid: no trusted issuer signed this, or it was changed."
                        case .unrecognized: message = "That doesn't look like a Vouch credential or issuer key."
                        }
                        text = ""
                    }
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

private struct IssuerKeySheet: View {
    @Environment(VouchStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                if let qr = store.issuerQR {
                    Text("Scan or paste this on another device to trust credentials signed by this phone.")
                        .multilineTextAlignment(.center)
                    QRCodeView(text: qr, label: "QR code for this phone's issuer key")
                    ShareLink(item: qr) { Label("Share issuer key", systemImage: "square.and.arrow.up") }
                    Text(qr).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                } else {
                    Text("No signing key on this device.")
                }
            }
            .padding()
            .navigationTitle("Issuer key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}
