// Theme.swift
// The web app's design system (styles.css) translated to SwiftUI: same colours, fonts,
// card shapes, buttons, chips and labels, so the iPhone app looks like the website.

import CoreText
import SwiftUI

// MARK: - Colours (hex values copied from styles.css)

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

/// Proofly's "lavender, ink and warm white" palette: the final :root block in styles.css,
/// with each value read from the live web page's computed styles at phone width.
enum VColor {
    static let ink = Color(hex: 0x302941)
    static let muted = Color(hex: 0x625C70)
    static let blue = Color(hex: 0x59458E)          // --blue (primary purple)
    static let blueDark = Color(hex: 0x44346F)      // --blue-dark
    static let line = Color(hex: 0xE7E1ED)
    static let paper = Color(hex: 0xF8F6FA)
    static let surface = Color(hex: 0xFFFCFA)       // warm white cards and header
    static let tint = Color(hex: 0xF0EBF7)
    static let tintStrong = Color(hex: 0xE4DCF0)
    static let card = surface
    static let cardBorder = line
    static let shadow = Color(hex: 0x4F3E67)

    static let overline = Color(hex: 0x655B76)
    static let overlineDot = Color(hex: 0x7862A0)
    static let subtitle = muted
    static let spark = Color(hex: 0x8571A7)
    static let cardLabel = Color(hex: 0x655B70)
    static let bodyText = muted

    static let noticeText = Color(hex: 0x554B68)
    static let noticeBorder = Color(hex: 0xE1D9EB)
    static let noticeBackground = tint

    static let navActive = tintStrong
    static let navActiveText = blueDark
    static let navText = Color(hex: 0x5D5669)
    static let navCount = Color(hex: 0xD7CCE8)
    static let avatar = tintStrong
    static let avatarText = blueDark
    static let pillText = noticeText
    static let pillDot = overlineDot
    static let breadcrumb = Color(hex: 0x6E6577)
    static let breadcrumbStrong = Color(hex: 0x4D455B)

    static let heroBackground = Color(hex: 0xE8E0F2)
    static let heroPhoto = Color(hex: 0xD9CEE8)
    static let heroTitle = ink
    static let heroEmphasis = Color(hex: 0x6A538C)
    static let heroText = Color(hex: 0x51475F)
    static let heroTag = Color(hex: 0x605173)
    static let captionText = Color(hex: 0x574965)
    static let captionArrow = Color(hex: 0x806B9C)

    static let impactTop = Color(hex: 0xF1EAF7)      // linear-gradient(145deg, #f1eaf7, #e6deef)
    static let impactBottom = Color(hex: 0xE6DEEF)
    static let impactKicker = Color(hex: 0x594E61)
    static let impactSpark = Color(hex: 0x725C96)
    static let impactSub = impactKicker
    static let impactText = impactKicker
    static let impactRule = Color(hex: 0xD5C9E2)
    static let impactDetail = impactKicker
    static let impactCheck = impactSpark

    static let journeyNumber = Color(hex: 0x725C96)

    static let meta = muted
    static let projectText = muted
    static let arrowBorder = Color(hex: 0xDDD4E8)
    static let arrowIcon = blue

    static let howBackground = tint
    static let howBorder = line
    static let howSymbolBackground = tintStrong
    static let howSymbol = blue
    static let howText = muted

    static let chipBackground = tint
    static let chipText = Color(hex: 0x51436D)
    static let verifiedText = Color(hex: 0x51416F)
    static let verifiedBackground = Color(hex: 0xEAE4F3)
    static let invalidText = Color(hex: 0xA7432D)
    static let invalidBackground = Color(hex: 0xFFF0EB)
    static let badgeBackground = tintStrong
    static let badgeIcon = blue
    static let credentialMeta = muted

    static let quoteBackground = Color(hex: 0xF5F1F8)
    static let quoteBorder = Color(hex: 0xA898C0)
    static let quoteText = Color(hex: 0x51485B)
    static let quoteAttribution = Color(hex: 0x63586B)

    static let resultBackground = verifiedBackground
    static let resultIcon = verifiedText
    static let gapBackground = Color(hex: 0xEEEAF0)
    static let gapIcon = Color(hex: 0x5E5665)
    static let resultText = Color(hex: 0x625A6C)

    // Side panels (.explain-panel, .vouch-aside, .verification-aside). Kept the old "greenPanel" names.
    static let greenPanel = tint
    static let greenPanelText = ink
    static let greenPanelBody = muted
    static let greenPanelKicker = Color(hex: 0x75618F)
    static let greenPanelRule = Color(hex: 0xDED4E8)
    static let greenPanelIcon = greenPanelKicker

    static let lensPromo = tint
    static let lensPromoKicker = muted
    static let lensPromoText = muted
    static let lensIcon = blue
    static let lensIconBackground = tintStrong
    static let roleBadge = tint
    static let roleBadgeText = chipText

    static let statusBackground = tint                 // .verification-status, .badge-result
    static let statusText = Color(hex: 0x504460)

    static let fieldBorder = Color(hex: 0xD8D0E0)
    static let fieldBackground = Color(hex: 0xFDFBFE)
    static let fieldLabel = cardLabel
    static let hint = resultText
    static let voiceBackground = tint
    static let skillOption = tint
    static let skillOptionSelected = tintStrong
    static let skillOptionText = chipText
    static let checkText = Color(hex: 0x64746A)
    static let subtleButton = tint
    static let subtleButtonText = blueDark
    static let whiteButtonText = blueDark
    static let focus = Color(hex: 0x6D509F)
    static let footer = breadcrumb
    static let footerStar = captionArrow
    static let dialogDetail = quoteBackground
    static let verificationBody = muted               // .verification-panel p, .badge-lookup p

    // The web's lavender refresh paints every project icon the same (.project-icon.peach/.lilac/.mint).
    static let peach = (background: tintStrong, icon: blue)
    static let lilac = (background: tintStrong, icon: blue)
    static let mint = (background: tintStrong, icon: blue)
}

// MARK: - Fonts (DM Serif Display for page headings, Manrope for card titles, DM Sans for text;
// bundled from Google Fonts, OFL licence)

enum VFont {
    private static let files = ["manrope-700", "manrope-800", "dm-sans-400", "dm-sans-500", "dm-sans-700",
                                "dm-serif-display-400", "dm-serif-display-400-italic"]

    /// Registers the bundled .ttf files for this process. Safe to call more than once.
    static func register() {
        for name in files {
            guard let url = Bundle.main.url(forResource: name, withExtension: "ttf")
                    ?? Bundle.main.url(forResource: name, withExtension: "ttf", subdirectory: "Fonts")
            else { continue }   // falls back to the system font if a file is missing
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }

    // PostScript names inside the bundled files.
    static let displayBold = "ManropeExtraLight-Bold"
    static let displayExtraBold = "ManropeExtraLight-ExtraBold"
    static let textRegular = "DMSans9pt-Regular"
    static let textMedium = "DMSans9pt-Medium"
    static let textBold = "DMSans9pt-Bold"
    static let serif = "DMSerifDisplay-Regular"
    static let serifItalic = "DMSerifDisplay-Italic"
}

extension Font {
    /// DM Serif Display, used by the web for page and section headings (h1/h2).
    static func serif(_ size: CGFloat, italic: Bool = false, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(italic ? VFont.serifItalic : VFont.serif, size: size, relativeTo: style)
    }

    /// Manrope (card titles, brand name). Scales with the user's text size setting.
    static func display(_ size: CGFloat, bold: Bool = false, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(bold ? VFont.displayBold : VFont.displayExtraBold, size: size, relativeTo: style)
    }

    /// DM Sans body text. Scales with the user's text size setting.
    static func text(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .bold, .heavy, .black, .semibold: name = VFont.textBold
        case .medium: name = VFont.textMedium
        default: name = VFont.textRegular
        }
        return .custom(name, size: size, relativeTo: style)
    }
}

// MARK: - Layout primitives

/// Warm white card with the web's 1px border, 12px corners and soft lavender shadow.
struct CardModifier: ViewModifier {
    var background: Color = VColor.card
    var border: Color? = VColor.cardBorder
    var padding: CGFloat = 17

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: .rect(cornerRadius: 12))
            .overlay {
                if let border { RoundedRectangle(cornerRadius: 12).strokeBorder(border, lineWidth: 1) }
            }
            .shadow(color: border == nil ? .clear : VColor.shadow.opacity(0.045), radius: 9, y: 5)
    }
}

extension View {
    func vCard(background: Color = VColor.card, border: Color? = VColor.cardBorder, padding: CGFloat = 17) -> some View {
        modifier(CardModifier(background: background, border: border, padding: padding))
    }
}

/// Small uppercase letter-spaced label ("YOUR IMPACT, IN MOTION").
struct Overline: View {
    let text: String
    var color: Color = VColor.overline
    var dot = false

    var body: some View {
        HStack(spacing: 7) {
            if dot { Circle().fill(VColor.overlineDot).frame(width: 6, height: 6) }
            Text(text.uppercased())
                .font(.text(10.5, weight: .bold, relativeTo: .caption2))
                .tracking(1.2)
                .foregroundStyle(color)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Page header used at the top of every section on the web.
struct PageHeading: View {
    let overline: String
    let title: String
    var accent: String = "."
    var subtitle: String
    var badge: (text: String, systemImage: String)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Overline(text: overline, dot: true)
            (Text(title).foregroundStyle(VColor.ink) + Text(accent).foregroundStyle(VColor.spark))
                .font(.serif(34, relativeTo: .largeTitle))
                .tracking(-0.8)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(subtitle)
                .font(.text(15))
                .foregroundStyle(VColor.subtitle)
            if let badge {
                Label(badge.text.uppercased(), systemImage: badge.systemImage)
                    .font(.text(10.5, weight: .bold, relativeTo: .caption2))
                    .tracking(1)
                    .foregroundStyle(VColor.roleBadgeText)
                    .padding(9)
                    .background(VColor.roleBadge, in: .rect(cornerRadius: 8))
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// "01 / THE OPPORTUNITY" style card label with optional right-hand text.
struct CardLabel: View {
    let left: String
    var right: String? = nil
    var rightColor: Color = VColor.cardLabel

    var body: some View {
        HStack {
            Text(left.uppercased())
            Spacer()
            if let right { Text(right.uppercased()).foregroundStyle(rightColor) }
        }
        .font(.text(10.5, weight: .bold, relativeTo: .caption2))
        .tracking(1.2)
        .foregroundStyle(VColor.cardLabel)
    }
}

// MARK: - Buttons

struct VButtonStyle: ButtonStyle {
    enum Kind { case primary, white, subtle }
    var kind: Kind = .primary
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.text(14, weight: .bold, relativeTo: .callout))
            .foregroundStyle(foreground)
            .padding(.horizontal, 18)
            .frame(minHeight: 48)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .background(background(pressed: configuration.isPressed), in: .rect(cornerRadius: 8))
            .opacity(configuration.isPressed ? 0.92 : 1)
    }

    private var foreground: Color {
        switch kind {
        case .primary: .white
        case .white: VColor.whiteButtonText
        case .subtle: VColor.subtleButtonText
        }
    }

    private func background(pressed: Bool) -> Color {
        switch kind {
        case .primary: pressed ? VColor.blueDark : VColor.blue
        case .white: VColor.surface
        case .subtle: VColor.subtleButton
        }
    }
}

extension ButtonStyle where Self == VButtonStyle {
    static var vPrimary: VButtonStyle { VButtonStyle(kind: .primary) }
    static var vPrimaryWide: VButtonStyle { VButtonStyle(kind: .primary, fullWidth: true) }
    static var vWhite: VButtonStyle { VButtonStyle(kind: .white) }
    static var vSubtle: VButtonStyle { VButtonStyle(kind: .subtle) }
}

/// Blue bold text link ("View all projects").
struct TextLinkStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.text(13, weight: .bold, relativeTo: .footnote))
            .foregroundStyle(configuration.isPressed ? VColor.blueDark : VColor.blue)
            .frame(minHeight: 44)
            .contentShape(.rect)
    }
}

extension ButtonStyle where Self == TextLinkStyle {
    static var vLink: TextLinkStyle { TextLinkStyle() }
}

// MARK: - Small components

struct SkillChip: View {
    let skill: String
    var body: some View {
        Text(skill)
            .font(.text(12, weight: .bold, relativeTo: .caption))
            .foregroundStyle(VColor.chipText)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(VColor.chipBackground, in: .rect(cornerRadius: 5))
    }
}

struct VerifiedBadge: View {
    var valid = true
    var body: some View {
        Label(valid ? "SIGNATURE VALID" : "NOT VALID", systemImage: valid ? "checkmark.shield" : "xmark.shield")
            .font(.text(10.5, weight: .bold, relativeTo: .caption2))
            .foregroundStyle(valid ? VColor.verifiedText : VColor.invalidText)
            .padding(.horizontal, 7)
            .padding(.vertical, 5)
            .background(valid ? VColor.verifiedBackground : VColor.invalidBackground, in: .rect(cornerRadius: 3))
    }
}

/// The award square next to credentials.
struct BadgeSymbol: View {
    var body: some View {
        Image(systemName: "rosette")
            .font(.system(size: 18, weight: .medium))
            .foregroundStyle(VColor.badgeIcon)
            .frame(width: 40, height: 40)
            .background(VColor.badgeBackground, in: .rect(cornerRadius: 5))
            .accessibilityHidden(true)
    }
}

struct DemoNotice: View {
    var text = "Demo workspace: people, projects and issuer are fictional. Signatures are real, but do not establish organizational identity."
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "info.circle").font(.system(size: 13))
            Text(text).font(.text(12, relativeTo: .caption))
        }
        .foregroundStyle(VColor.noticeText)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VColor.noticeBackground, in: .rect(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).strokeBorder(VColor.noticeBorder) }
    }
}

/// Blockquote with the lavender left rule, as on credential cards.
struct QuoteBlock: View {
    let text: String
    var attribution: String? = nil

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(VColor.quoteBorder).frame(width: 3)
            VStack(alignment: .leading, spacing: 7) {
                Text("“\(text)”")
                    .font(.text(15))
                    .foregroundStyle(VColor.quoteText)
                    .lineSpacing(3)
                if let attribution {
                    Text(attribution)
                        .font(.text(12, weight: .bold, relativeTo: .caption))
                        .foregroundStyle(VColor.quoteAttribution)
                }
            }
            .padding(15)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(VColor.quoteBackground)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// Simple wrapping row for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(widest, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Standard text field look from the web form (pale fill, thin lavender-grey border).
struct VFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.text(17))
            .foregroundStyle(VColor.ink)
            .padding(12)
            .background(VColor.fieldBackground, in: .rect(cornerRadius: 8))
            .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(VColor.fieldBorder) }
    }
}

extension View {
    func vField() -> some View { modifier(VFieldModifier()) }
}

struct FieldLabel: View {
    let text: String
    var body: some View {
        Text(text).font(.text(15, weight: .bold, relativeTo: .subheadline)).foregroundStyle(VColor.ink)
    }
}

/// Footer from the bottom of every web page.
struct VFooter: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 0) {
                Text("© 2026 PROOFLY")
                Text("✳").foregroundStyle(VColor.footerStar).padding(.horizontal, 7)
                Text("BUILT FOR CALGARY")
            }
            Text("GOOD WORK SHOULD GO PLACES.")
        }
        .font(.text(10, weight: .bold, relativeTo: .caption2))
        .tracking(1)
        .foregroundStyle(VColor.footer)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 24)
    }
}

/// Standard page wrapper: paper background, demo notice, consistent padding.
struct VPage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                DemoNotice().padding(.bottom, 25)
                content
                VFooter()
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(VColor.paper)
    }
}
