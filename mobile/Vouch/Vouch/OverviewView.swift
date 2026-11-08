// OverviewView.swift — the web "Overview" section, laid out like the website at phone width.

import Foundation
import SwiftUI

struct OverviewView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab
    @Binding var vouchTask: String

    var body: some View {
        let verified = store.verified
        VPage {
            VStack(alignment: .leading, spacing: 0) {
                Overline(text: "Your impact, in motion", dot: true)
                (Text("Good \(greeting), Priya ").foregroundStyle(VColor.ink) + Text("✳").foregroundStyle(VColor.spark))
                    .font(.serif(34, relativeTo: .largeTitle))
                    .tracking(-0.8)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 10)
                Text("Here's what your good work is building.")
                    .font(.text(15)).foregroundStyle(VColor.subtitle).padding(.top, 7)

                Button { selection = .projects } label: {
                    Label("Explore projects", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vPrimaryWide)
                .padding(.top, 22)

                JourneyCard(selection: $selection).padding(.top, 24)

                if let error = store.startupError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.text(13)).foregroundStyle(VColor.invalidText).padding(.top, 12)
                }

                FeaturePanel(selection: $selection).padding(.top, 24)

                SectionTitle(overline: "The work behind the proof", title: "Make your next move", spark: true,
                             link: "View all projects") { selection = .projects }
                    .padding(.top, 37)
                VStack(spacing: 9) {
                    ForEach(DemoData.projects.prefix(2)) { project in
                        ProjectCard(project: project) {
                            vouchTask = project.title
                            selection = .vouch
                        }
                    }
                }

                HowStrip { selection = .vouch }.padding(.top, 16)

                ImpactPanel(count: verified.count).padding(.top, 23)

                SectionTitle(overline: "Proof with a purpose", title: "Your latest credential", spark: false, link: nil) {}
                    .padding(.top, 30)
                if let latest = verified.last {
                    LatestCredentialCard(credential: latest)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("No valid signed credentials yet.").font(.text(14)).foregroundStyle(VColor.credentialMeta)
                        Button("Create a demo vouch →") { selection = .vouch }.buttonStyle(.vLink)
                    }
                    .vCard()
                }

                LensPromo { selection = .lens }.padding(.top, 15)
            }
        }
    }

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<12: "morning"
        case 12..<17: "afternoon"
        default: "evening"
        }
    }
}

/// "Your skills deserve to be seen." hero panel with the community photo.
private struct FeaturePanel: View {
    @Binding var selection: AppTab
    private let photo = URL(string: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80")

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Label("A LITTLE WORK. A BIGGER STORY.", systemImage: "sparkles")
                    .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1.2)
                    .foregroundStyle(VColor.heroTag)
                (Text("Your skills deserve to ").font(.serif(34, relativeTo: .largeTitle)).foregroundStyle(VColor.heroTitle)
                 + Text("be seen.").font(.serif(34, italic: true, relativeTo: .largeTitle)).foregroundStyle(VColor.heroEmphasis))
                    .tracking(-0.6)
                    .padding(.top, 17)
                Text("The things you do for your community say a lot about what you can do next.")
                    .font(.text(15)).foregroundStyle(VColor.heroText).lineSpacing(3)
                    .padding(.top, 11)
                Button { selection = .credentials } label: {
                    Label("See your credentials", systemImage: "arrow.up.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vWhite)
                .padding(.top, 20)
            }
            .padding(.horizontal, 25)
            .padding(.vertical, 29)

            ZStack(alignment: .bottomTrailing) {
                AsyncImage(url: photo) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    VColor.heroPhoto
                }
                .frame(height: 200)
                .clipped()
                .accessibilityHidden(true)
                HStack(spacing: 9) {
                    Text("COMMUNITY LOOKS GOOD ON YOU")
                        .font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1)
                        .foregroundStyle(VColor.captionText)
                    Image(systemName: "arrow.up.right").font(.system(size: 13, weight: .bold)).foregroundStyle(VColor.captionArrow)
                }
                .padding(12)
                .background(VColor.surface, in: .rect(cornerRadius: 7))
                .padding(15)
            }
        }
        .background(VColor.heroBackground)
        .clipShape(.rect(cornerRadius: 14))
        .shadow(color: VColor.shadow.opacity(0.1), radius: 18, y: 14)
    }
}

struct SectionTitle: View {
    let overline: String
    let title: String
    let spark: Bool
    let link: String?
    let action: () -> Void

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 7) {
                Overline(text: overline)
                (Text(title).foregroundStyle(VColor.ink) + Text(spark ? " ✳" : "").foregroundStyle(VColor.spark))
                    .font(.serif(25, relativeTo: .title2))
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer()
            if let link {
                Button(action: action) {
                    Label(link, systemImage: "arrow.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vLink)
            }
        }
        .padding(.bottom, 15)
    }
}

/// "Good work. Real-world proof." strip.
private struct HowStrip: View {
    let action: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                Image(systemName: "hand.raised")
                    .font(.system(size: 17)).foregroundStyle(VColor.howSymbol)
                    .frame(width: 36, height: 36).background(VColor.howSymbolBackground, in: .circle)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Good work. Real-world proof.").font(.display(15, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    Text("Every story starts with someone you helped.").font(.text(13)).foregroundStyle(VColor.howText)
                }
            }
            Button(action: action) {
                Label("Give a vouch", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
            }
            .buttonStyle(.vLink)
            .padding(.leading, 48)
        }
        .vCard(background: VColor.howBackground, border: VColor.howBorder, padding: 15)
    }
}

/// Soft lavender "YOUR IMPACT" panel.
private struct ImpactPanel: View {
    let count: Int
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("YOUR IMPACT").font(.text(10.5, weight: .bold, relativeTo: .caption2)).tracking(1.2).foregroundStyle(VColor.impactKicker)
                Spacer()
                Text("✳").font(.system(size: 21)).foregroundStyle(VColor.impactSpark)
            }
            HStack(spacing: 13) {
                Text("\(count)").font(.serif(56, relativeTo: .largeTitle)).foregroundStyle(VColor.ink)
                Text(count == 1 ? "signed\ncredential" : "signed\ncredentials")
                    .font(.text(13)).foregroundStyle(VColor.impactSub).lineSpacing(2)
            }
            .padding(.top, 14)
            .accessibilityElement(children: .combine)
            Text("Every credential tells the story behind a skill.")
                .font(.text(13)).foregroundStyle(VColor.impactText).padding(.top, 10)
            Rectangle().fill(VColor.impactRule).frame(height: 1).padding(.top, 19)
            detail("Signature checked", "Ed25519", icon: "checkmark.shield").padding(.top, 13)
            detail("Grounded in", "Submitted words", icon: "quote.opening").padding(.top, 10)
        }
        .foregroundStyle(VColor.ink)
        .padding(25)
        .background(LinearGradient(colors: [VColor.impactTop, VColor.impactBottom],
                                   startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: .rect(cornerRadius: 14))
        .shadow(color: VColor.shadow.opacity(0.08), radius: 16, y: 14)
    }

    private func detail(_ label: String, _ value: String, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
                .foregroundStyle(VColor.impactDetail)
                .labelStyle(TintedIconLabel(iconColor: VColor.impactCheck))
            Spacer()
            Text(value).fontWeight(.bold)
        }
        .font(.text(13))
    }
}

struct TintedIconLabel: LabelStyle {
    let iconColor: Color
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 7) {
            configuration.icon.foregroundStyle(iconColor)
            configuration.title
        }
    }
}

private struct LatestCredentialCard: View {
    let credential: VerifiedCredential
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                BadgeSymbol()
                Spacer()
                VerifiedBadge()
            }
            Text(credential.payload.title)
                .font(.display(17, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                .padding(.top, 15)
            Text("\(credential.payload.issuer) · Demo")
                .font(.text(12)).foregroundStyle(VColor.credentialMeta).padding(.top, 5)
            Rectangle().fill(VColor.line).frame(height: 1).padding(.top, 14)
            NavigationLink(value: credential) {
                Label("View the story", systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabel())
                    .font(.text(13, weight: .bold, relativeTo: .footnote))
                    .foregroundStyle(VColor.blue)
                    .frame(minHeight: 44)
            }
        }
        .vCard()
    }
}

struct TrailingIconLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) { configuration.title; configuration.icon }
    }
}

/// Lilac "A DIFFERENT KIND OF MATCH" card.
private struct LensPromo: View {
    let action: () -> Void
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "text.viewfinder")
                .font(.system(size: 15)).foregroundStyle(VColor.lensIcon)
                .frame(width: 34, height: 34).background(VColor.lensIconBackground, in: .rect(cornerRadius: 5))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("A DIFFERENT KIND OF MATCH").font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1.2).foregroundStyle(VColor.lensPromoKicker)
                Text("See it through an employer's eyes.").font(.display(16, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink).padding(.top, 8)
                Text("Turn a job description into a clear evidence map.").font(.text(13)).foregroundStyle(VColor.lensPromoText).padding(.top, 5)
                Button(action: action) {
                    Label("Try the employer lens", systemImage: "arrow.right").labelStyle(TrailingIconLabel())
                }
                .buttonStyle(.vLink)
            }
        }
        .vCard(background: VColor.lensPromo, border: VColor.line)
    }
}

/// "A MORE HUMAN KIND OF PROOF" card with the three steps (index.html .journey).
private struct JourneyCard: View {
    @Binding var selection: AppTab

    private let steps: [(number: String, title: String, detail: String, tab: AppTab)] = [
        ("01", "Find a project", "Explore example opportunities", .projects),
        ("02", "Share the story", "Create a demo vouch", .vouch),
        ("03", "See the connection", "Explore the employer lens", .lens),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Overline(text: "A more human kind of proof")
            Text("From good work to new opportunities.")
                .font(.serif(25, relativeTo: .title2))
                .foregroundStyle(VColor.ink)
                .padding(.top, 7)
                .padding(.bottom, 12)
                .accessibilityAddTraits(.isHeader)
            ForEach(steps, id: \.number) { step in
                Button { selection = step.tab } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(step.number)
                            .font(.display(12, bold: true, relativeTo: .caption))
                            .foregroundStyle(VColor.journeyNumber)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.title).font(.display(15, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                            Text(step.detail).font(.text(13)).foregroundStyle(VColor.muted)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(VColor.journeyNumber)
                            .accessibilityHidden(true)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                    .overlay(alignment: .top) { Rectangle().fill(VColor.line).frame(height: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityHint(step.detail)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VColor.surface, in: .rect(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).strokeBorder(VColor.line) }
        .shadow(color: VColor.shadow.opacity(0.05), radius: 12, y: 8)
    }
}
