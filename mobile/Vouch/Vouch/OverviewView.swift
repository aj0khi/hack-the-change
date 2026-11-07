// OverviewView.swift — the web "Overview" section, laid out like the website at phone width.

import SwiftUI

struct OverviewView: View {
    @Environment(VouchStore.self) private var store
    @Binding var selection: AppTab

    var body: some View {
        let verified = store.verified
        VPage {
            VStack(alignment: .leading, spacing: 0) {
                Overline(text: "Your impact, in motion", dot: true)
                (Text("Good \(greeting), Priya ").foregroundStyle(VColor.ink) + Text("✳").foregroundStyle(VColor.spark))
                    .font(.display(30, relativeTo: .largeTitle))
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 10)
                Text("Here's what your good work is building.")
                    .font(.text(15)).foregroundStyle(VColor.subtitle).padding(.top, 7)

                Button("Explore projects") { selection = .projects }
                    .buttonStyle(.vPrimaryWide)
                    .padding(.top, 22)

                if let error = store.startupError {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.text(13)).foregroundStyle(VColor.invalidText).padding(.top, 12)
                }

                FeaturePanel(selection: $selection).padding(.top, 28)

                SectionTitle(overline: "The work behind the proof", title: "Make your next move", spark: true,
                             link: "View all projects") { selection = .projects }
                    .padding(.top, 37)
                VStack(spacing: 9) {
                    ForEach(DemoData.projects.prefix(2)) { project in
                        ProjectCard(project: project) { selection = .vouch }
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
                (Text("Your skills deserve to ").foregroundStyle(VColor.heroTitle)
                 + Text("be seen.").foregroundStyle(VColor.heroEmphasis))
                    .font(.display(30, relativeTo: .largeTitle))
                    .padding(.top, 17)
                Text("The things you do for your community say a lot about what you can do next.")
                    .font(.text(15)).foregroundStyle(VColor.heroText).lineSpacing(3)
                    .padding(.top, 11)
                Button("See your credentials") { selection = .credentials }
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
                .background(.white, in: .rect(cornerRadius: 4))
                .padding(15)
            }
        }
        .background(VColor.heroBackground)
        .clipShape(.rect(cornerRadius: 6))
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
                    .font(.display(21, relativeTo: .title2))
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer()
            if let link { Button(link, action: action).buttonStyle(.vLink) }
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
                Image(systemName: "heart.text.square")
                    .font(.system(size: 17)).foregroundStyle(VColor.howSymbol)
                    .frame(width: 36, height: 36).background(VColor.howSymbolBackground, in: .circle)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Good work. Real-world proof.").font(.display(15, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink)
                    Text("Every story starts with someone you helped.").font(.text(13)).foregroundStyle(VColor.howText)
                }
            }
            Button("Give a vouch", action: action).buttonStyle(.vLink).padding(.leading, 48)
        }
        .vCard(background: VColor.howBackground, border: VColor.howBorder, padding: 15)
    }
}

/// Dark navy "YOUR IMPACT" panel.
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
                Text("\(count)").font(.display(52, bold: true, relativeTo: .largeTitle))
                Text(count == 1 ? "signed\ncredential" : "signed\ncredentials")
                    .font(.text(13)).foregroundStyle(VColor.impactSub).lineSpacing(2)
            }
            .padding(.top, 14)
            .accessibilityElement(children: .combine)
            Text("Every credential tells the story behind a skill.")
                .font(.text(13)).foregroundStyle(VColor.impactText).padding(.top, 10)
            Rectangle().fill(VColor.impactRule).frame(height: 1).padding(.top, 19)
            detail("Signature checked", "Ed25519").padding(.top, 13)
            detail("Grounded in", "Submitted words").padding(.top, 10)
        }
        .foregroundStyle(.white)
        .padding(22)
        .background(VColor.impactBackground, in: .rect(cornerRadius: 6))
    }

    private func detail(_ label: String, _ value: String) -> some View {
        HStack {
            Label(label, systemImage: "checkmark.circle")
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
            Image(systemName: "eye")
                .font(.system(size: 15)).foregroundStyle(VColor.lensIcon)
                .frame(width: 34, height: 34).background(VColor.lensIconBackground, in: .rect(cornerRadius: 5))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("A DIFFERENT KIND OF MATCH").font(.text(10, weight: .bold, relativeTo: .caption2)).tracking(1.2).foregroundStyle(VColor.lensPromoKicker)
                Text("See it through an employer's eyes.").font(.display(16, bold: true, relativeTo: .headline)).foregroundStyle(VColor.ink).padding(.top, 8)
                Text("Turn a job description into a clear evidence map.").font(.text(13)).foregroundStyle(VColor.lensPromoText).padding(.top, 5)
                Button("Try the employer lens", action: action).buttonStyle(.vLink)
            }
        }
        .vCard(background: VColor.lensPromo, border: nil)
    }
}
