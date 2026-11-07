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

enum VColor {
    static let ink = Color(hex: 0x20282B)
    static let muted = Color(hex: 0x75817E)
    static let blue = Color(hex: 0x314FDF)
    static let blueDark = Color(hex: 0x263FBA)
    static let line = Color(hex: 0xE6E9E5)
    static let paper = Color(hex: 0xF6F7F5)
    static let card = Color.white
    static let cardBorder = Color(hex: 0xE8ECE8)

    static let overline = Color(hex: 0x9BA8A1)
    static let overlineDot = Color(hex: 0x7AB087)
    static let subtitle = Color(hex: 0x87938E)
    static let spark = Color(hex: 0xEC9E7B)
    static let cardLabel = Color(hex: 0xA0ADA5)
    static let bodyText = Color(hex: 0x8E9D94)

    static let noticeText = Color(hex: 0x728075)
    static let noticeBorder = Color(hex: 0xE2E8DF)
    static let noticeBackground = Color(hex: 0xF1F5EE)

    static let navActive = Color(hex: 0xEEF1FF)
    static let navText = Color(hex: 0x7A8784)
    static let navCount = Color(hex: 0xE1E6FF)
    static let avatar = Color(hex: 0xE7B6A1)
    static let avatarText = Color(hex: 0x533B39)
    static let pillText = Color(hex: 0x718D72)
    static let pillDot = Color(hex: 0x79A77B)

    static let heroBackground = Color(hex: 0xC9DDD1)
    static let heroPhoto = Color(hex: 0xAAC9B5)
    static let heroTitle = Color(hex: 0x263F37)
    static let heroEmphasis = Color(hex: 0x668B75)
    static let heroText = Color(hex: 0x647D70)
    static let heroTag = Color(hex: 0x668376)
    static let captionText = Color(hex: 0x899A8D)
    static let captionArrow = Color(hex: 0xD47E66)

    static let impactBackground = Color(hex: 0x343E58)
    static let impactKicker = Color(hex: 0xAFB9C9)
    static let impactSpark = Color(hex: 0xB6CBA3)
    static let impactSub = Color(hex: 0xC1CAD5)
    static let impactText = Color(hex: 0xAAB6C4)
    static let impactRule = Color(hex: 0x59647C)
    static let impactDetail = Color(hex: 0xB8C2CE)
    static let impactCheck = Color(hex: 0x9ECBA5)

    static let meta = Color(hex: 0x9DAAA2)
    static let projectText = Color(hex: 0x8E9B94)
    static let arrowBorder = Color(hex: 0xE9EEE9)
    static let arrowIcon = Color(hex: 0x82948A)

    static let howBackground = Color(hex: 0xF0F4EB)
    static let howBorder = Color(hex: 0xE4E9DF)
    static let howSymbolBackground = Color(hex: 0xE2EBDC)
    static let howSymbol = Color(hex: 0x719177)
    static let howText = Color(hex: 0x95A295)

    static let chipBackground = Color(hex: 0xF2F5F1)
    static let chipText = Color(hex: 0x6F8373)
    static let verifiedText = Color(hex: 0x558D68)
    static let verifiedBackground = Color(hex: 0xECF6ED)
    static let invalidText = Color(hex: 0xAD5440)
    static let invalidBackground = Color(hex: 0xFFF0EB)
    static let badgeBackground = Color(hex: 0xF7E9DD)
    static let badgeIcon = Color(hex: 0xC9855E)
    static let credentialMeta = Color(hex: 0x90A099)

    static let quoteBackground = Color(hex: 0xF7F8F5)
    static let quoteBorder = Color(hex: 0xBACFB7)
    static let quoteText = Color(hex: 0x55685D)
    static let quoteAttribution = Color(hex: 0x9AA99D)

    static let resultBackground = Color(hex: 0xEAF5EB)
    static let resultIcon = Color(hex: 0x568B67)
    static let gapBackground = Color(hex: 0xF1F2EF)
    static let gapIcon = Color(hex: 0xA3ADA5)
    static let resultText = Color(hex: 0x84948A)

    static let greenPanel = Color(hex: 0xE8EEE8)
    static let greenPanelText = Color(hex: 0x354B3F)
    static let greenPanelBody = Color(hex: 0x748B7A)
    static let greenPanelKicker = Color(hex: 0x85998A)
    static let greenPanelRule = Color(hex: 0xCFDDCF)
    static let greenPanelIcon = Color(hex: 0x689473)

    static let lensPromo = Color(hex: 0xEEF0FA)
    static let lensPromoKicker = Color(hex: 0x909DC1)
    static let lensPromoText = Color(hex: 0x8B96AC)
    static let lensIcon = Color(hex: 0x7182C4)
    static let lensIconBackground = Color(hex: 0xE2E6FA)
    static let roleBadge = Color(hex: 0xEAF0F6)
    static let roleBadgeText = Color(hex: 0x7589A2)

    static let fieldBorder = Color(hex: 0xD9E1D9)
    static let fieldBackground = Color(hex: 0xFBFCFA)
    static let fieldLabel = Color(hex: 0x8A9A91)
    static let hint = Color(hex: 0x99A79D)
    static let voiceBackground = Color(hex: 0xEEF1FF)
    static let skillOption = Color(hex: 0xF4F6F3)
    static let skillOptionText = Color(hex: 0x5D7064)
    static let checkText = Color(hex: 0x64746A)
    static let subtleButton = Color(hex: 0xF0F3F0)
    static let subtleButtonText = Color(hex: 0x586B62)
    static let whiteButtonText = Color(hex: 0x2D4850)
    static let focus = Color(hex: 0xE77958)
    static let footer = Color(hex: 0xB4BEB7)
    static let footerStar = Color(hex: 0xE49D80)
    static let dialogDetail = Color(hex: 0xF5F7F4)

    static let peach = (background: Color(hex: 0xFAEEE8), icon: Color(hex: 0xCF8269))
    static let lilac = (background: Color(hex: 0xEDEEFF), icon: Color(hex: 0x7E87C6))
    static let mint = (background: Color(hex: 0xE5F1EA), icon: Color(hex: 0x6B9C7D))
}

// MARK: - Fonts (Manrope for headings, DM Sans for text, bundled from Google Fonts, OFL licence)

enum VFont {
    private static let files = ["manrope-700", "manrope-800", "dm-sans-400", "dm-sans-500", "dm-sans-700"]

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
}

extension Font {
    /// Manrope headings. Scales with the user's text size setting.
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

/// White card with the web's 1px border and 6px corners.
struct CardModifier: ViewModifier {
    var background: Color = VColor.card
    var border: Color? = VColor.cardBorder
    var padding: CGFloat = 17

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: .rect(cornerRadius: 6))
            .overlay {
                if let border { RoundedRectangle(cornerRadius: 6).strokeBorder(border, lineWidth: 1) }
            }
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
                .font(.display(30, relativeTo: .largeTitle))
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
                    .background(VColor.roleBadge, in: .rect(cornerRadius: 4))
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
            .background(background(pressed: configuration.isPressed), in: .rect(cornerRadius: 5))
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
        case .white: .white
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
            .background(VColor.chipBackground, in: .rect(cornerRadius: 3))
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

/// The peach award square next to credentials.
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
        .background(VColor.noticeBackground, in: .rect(cornerRadius: 4))
        .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(VColor.noticeBorder) }
    }
}

/// Blockquote with the green left rule, as on credential cards.
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

/// Standard text field look from the web form (pale fill, thin green-grey border).
struct VFieldModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.text(17))
            .foregroundStyle(VColor.ink)
            .padding(12)
            .background(VColor.fieldBackground, in: .rect(cornerRadius: 4))
            .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(VColor.fieldBorder) }
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
                Text("© 2026 VOUCH YYC")
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
