// VouchView.swift — the web "Give a vouch" section, built for the person who was helped:
// large text, a voice button, and every skill tied to an exact sentence they said.

import Foundation
import SwiftUI
import UIKit

struct VouchView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab
    @Binding var task: String

    @State private var speech = SpeechCapture()
    @State private var witnessName = ""
    @State private var transcript = ""
    @State private var mappings: [SkillMapping] = []
    @State private var confirmedWords = false
    @State private var showReview = false
    @State private var error: String?

    private var sentences: [String] { DemoData.sentences(in: transcript) }

    var body: some View {
        VPage {
            PageHeading(overline: "The people behind the proof", title: "Every good story starts with someone",
                        subtitle: "Tell us about the help you received, in your own words.",
                        badge: ("Community view", "hand.raised"))
            EvidenceAside().padding(.top, 28)

            VStack(alignment: .leading, spacing: 0) {
                CardLabel(left: "Your words matter", right: "About 2 min")
                Text("How did it go?").font(.serif(27, relativeTo: .title2)).foregroundStyle(VColor.ink).padding(.top, 22)
                Text("Use your own words. You can type or tap Use voice.")
                    .font(.text(14)).foregroundStyle(VColor.bodyText).padding(.top, 7).padding(.bottom, 22)

                FieldLabel(text: "What did they help with?")
                Menu {
                    Picker("Project", selection: $task) {
                        ForEach(DemoData.projects) { Text($0.title).tag($0.title) }
                    }
                } label: {
                    HStack {
                        Text(task.isEmpty ? "Choose a project" : task)
                            .foregroundStyle(task.isEmpty ? VColor.hint : VColor.ink)
                            .multilineTextAlignment(.leading)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").foregroundStyle(VColor.arrowIcon)
                    }
                    .vField()
                }
                .accessibilityLabel("What did they help with? \(task.isEmpty ? "Choose a project" : task)")
                .padding(.top, 8)

                FieldLabel(text: "Your first name").padding(.top, 20)
                TextField("e.g. Doug", text: $witnessName)
                    .textContentType(.givenName)
                    .vField()
                    .padding(.top, 8)

                HStack(alignment: .bottom) {
                    FieldLabel(text: "What would you like to say?")
                    Spacer()
                    Button {
                        speech.toggle { spoken in
                            transcript = transcript.isEmpty ? spoken : transcript + " " + spoken
                        }
                    } label: {
                        Label(speech.isRecording ? "Stop" : "Use voice",
                              systemImage: speech.isRecording ? "stop.fill" : "mic")
                            .font(.text(13, weight: .bold, relativeTo: .footnote))
                            .foregroundStyle(speech.isRecording ? .white : VColor.blue)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 40)
                            .background(speech.isRecording ? VColor.invalidText : VColor.voiceBackground, in: .rect(cornerRadius: 4))
                    }
                    .accessibilityLabel(speech.isRecording ? "Stop voice input" : "Use voice")
                }
                .padding(.top, 20)
                if speech.isRecording, !speech.liveText.isEmpty {
                    Text(speech.liveText).font(.text(16)).foregroundStyle(VColor.bodyText).padding(.top, 8)
                }
                TextField("They showed me how to...", text: $transcript, axis: .vertical)
                    .lineLimit(5...10)
                    .vField()
                    .padding(.top, 8)
                    .onChange(of: transcript) {
                        mappings = mappings.filter { transcript.contains($0.quote) }
                        confirmedWords = false
                    }
                Text(speech.status.isEmpty ? speech.privacyNote : speech.status)
                    .font(.text(13)).foregroundStyle(VColor.hint).padding(.top, 8)

                FieldLabel(text: "What skills did you see?").padding(.top, 20)
                Text("Tap a skill under the sentence that shows it. Your exact words are attached to each skill.")
                    .font(.text(13)).foregroundStyle(VColor.bodyText).padding(.top, 6)
                if sentences.isEmpty {
                    Text("Your sentences will appear here once you've said or typed something.")
                        .font(.text(13)).foregroundStyle(VColor.hint)
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(VColor.skillOption, in: .rect(cornerRadius: 5))
                        .padding(.top, 12)
                } else {
                    VStack(spacing: 10) {
                        ForEach(sentences, id: \.self) { SentenceSkills(sentence: $0, mappings: $mappings) }
                    }
                    .padding(.top, 12)
                }

                Toggle(isOn: $confirmedWords) {
                    Text("These are my words and I agree to include them in this demo credential.")
                        .font(.text(14, weight: .medium)).foregroundStyle(VColor.checkText)
                }
                .toggleStyle(CheckboxStyle())
                .padding(.top, 22)

                Label("Saved on this phone only. Don't enter sensitive information.", systemImage: "lock")
                    .font(.text(13)).foregroundStyle(VColor.noticeText)
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading)
                    .background(VColor.tint, in: .rect(cornerRadius: 5))
                    .padding(.top, 18)

                if let error {
                    Text(error).font(.text(14, weight: .bold)).foregroundStyle(VColor.invalidText).padding(.top, 14)
                }
                Button("Confirm and review vouch") { continueToReview() }
                    .buttonStyle(.vPrimaryWide)
                    .padding(.top, 20)
            }
            .vCard(border: VColor.line, padding: 19)
            .padding(.top, 20)
        }
        .sheet(isPresented: $showReview) {
            ApprovalSheet(payload: makePayload(), onApprove: approve)
        }
        .onDisappear { speech.stop() }
    }

    private func makePayload() -> VouchPayload {
        VouchPayload(
            title: task,
            witness: witnessName.trimmingCharacters(in: .whitespacesAndNewlines),
            transcript: transcript.trimmingCharacters(in: .whitespacesAndNewlines),
            issuer: DemoData.issuerName,
            student: DemoData.studentName,
            example: false,
            issuedAt: Self.today(),
            mappings: mappings)
    }

    /// Local date as YYYY-MM-DD, same format as the web app.
    private static func today() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: .now)
    }

    private func continueToReview() {
        if task.isEmpty {
            error = "Choose the project they helped with."
        } else if witnessName.trimmingCharacters(in: .whitespaces).isEmpty || transcript.trimmingCharacters(in: .whitespaces).isEmpty {
            error = "Add your first name and your words."
        } else if mappings.isEmpty {
            error = "Choose at least one skill supported by your words."
        } else if !confirmedWords {
            error = "Please confirm these are your words."
        } else {
            error = nil
            speech.stop()
            showReview = true
        }
    }

    private func approve() {
        do {
            try store.issue(makePayload())
            witnessName = ""; transcript = ""; mappings = []; confirmedWords = false
            showReview = false
            selection = .credentials
            UIAccessibility.post(notification: .announcement, argument: "Your demo credential was signed and saved on this phone.")
        } catch {
            self.error = "Could not issue the credential: \(error.localizedDescription)"
            showReview = false
        }
    }
}

/// Lavender "Your experience is the evidence." panel (shown first on phones, like the website).
private struct EvidenceAside: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("“").font(.custom("Georgia-Bold", size: 70, relativeTo: .largeTitle)).foregroundStyle(VColor.greenPanelKicker).frame(height: 40)
                .accessibilityHidden(true)
            Text("Your experience is the evidence.")
                .font(.serif(31, relativeTo: .title)).foregroundStyle(VColor.greenPanelText).padding(.top, 10)
            Text("What you say helps someone show what they can do. Nothing is issued until you confirm your words.")
                .font(.text(14)).foregroundStyle(VColor.greenPanelBody).lineSpacing(4).padding(.top, 10)
            VStack(spacing: 0) {
                step("01", "Share what happened")
                step("02", "Choose the skills you saw")
                step("03", "Confirm your words")
            }
            .overlay(alignment: .top) { Rectangle().fill(VColor.greenPanelRule).frame(height: 1) }
            .padding(.top, 22)
        }
        .vCard(background: VColor.greenPanel, border: nil, padding: 26)
    }

    private func step(_ number: String, _ text: String) -> some View {
        HStack(spacing: 18) {
            Text(number).font(.text(12, weight: .bold, relativeTo: .caption)).foregroundStyle(VColor.greenPanelKicker)
            Text(text).font(.text(15, weight: .bold)).foregroundStyle(VColor.greenPanelText)
            Spacer()
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(VColor.greenPanelRule).frame(height: 1) }
    }
}

/// One sentence with tappable skill options underneath, styled like the web's skill checkboxes.
private struct SentenceSkills: View {
    let sentence: String
    @Binding var mappings: [SkillMapping]
    @State private var expanded = false

    private var linked: [String] { mappings.filter { $0.quote == sentence }.map(\.skill) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("“\(sentence)”").font(.text(16)).foregroundStyle(VColor.quoteText)
            FlowLayout(spacing: 8) {
                ForEach(expanded ? DemoData.skills : DemoData.skills.filter { linked.contains($0) }, id: \.self) { skill in
                    let on = linked.contains(skill)
                    Button {
                        if on { mappings.removeAll { $0.quote == sentence && $0.skill == skill } }
                        else { mappings.append(SkillMapping(skill: skill, quote: sentence)) }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: on ? "checkmark.square.fill" : "square")
                                .foregroundStyle(on ? VColor.blue : VColor.arrowIcon)
                            Text(skill)
                        }
                        .font(.text(13, weight: .medium, relativeTo: .footnote))
                        .foregroundStyle(VColor.skillOptionText)
                        .padding(.horizontal, 9)
                        .frame(minHeight: 40)
                        .background(on ? VColor.navActive : VColor.skillOption, in: .rect(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
                Button(expanded ? "Done" : (linked.isEmpty ? "Choose skills" : "Edit skills")) {
                    withAnimation(.snappy) { expanded.toggle() }
                }
                .buttonStyle(.vLink)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VColor.quoteBackground, in: .rect(cornerRadius: 4))
    }
}

/// The web's square checkbox.
private struct CheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 20))
                    .foregroundStyle(configuration.isOn ? VColor.blue : VColor.arrowIcon)
                configuration.label.multilineTextAlignment(.leading)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? .isSelected : [])
    }
}

/// "DEMO COORDINATOR REVIEW" sheet, like the web approval dialog.
private struct ApprovalSheet: View {
    let payload: VouchPayload
    let onApprove: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Overline(text: "Demo coordinator review")
                Text("Review the vouch").font(.serif(28, relativeTo: .title)).foregroundStyle(VColor.ink).padding(.top, 8)
                Text("This is a simulated approval, not a real organization or identity check. Review the confirmed words before issuing.")
                    .font(.text(14)).foregroundStyle(VColor.bodyText).padding(.top, 8)

                VStack(alignment: .leading, spacing: 7) {
                    Text(payload.title).font(.display(17, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    Text("Confirmed by: \(payload.witness)").font(.text(14)).foregroundStyle(VColor.muted)
                }
                .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                .background(VColor.dialogDetail, in: .rect(cornerRadius: 4))
                .padding(.top, 20)

                QuoteBlock(text: payload.transcript).padding(.vertical, 18)

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(payload.mappings, id: \.self) { mapping in
                        VStack(alignment: .leading, spacing: 6) {
                            SkillChip(skill: mapping.skill)
                            Text("“\(mapping.quote)”").font(.text(14)).foregroundStyle(VColor.resultText)
                        }
                    }
                }

                VStack(spacing: 8) {
                    Button("Approve and issue demo credential", action: onApprove).buttonStyle(.vPrimaryWide)
                    Button("Back to edit") { dismiss() }.buttonStyle(VButtonStyle(kind: .subtle, fullWidth: true))
                }
                .padding(.top, 26)
            }
            .padding(25)
        }
        .background(.white)
        .presentationDragIndicator(.visible)
    }
}
