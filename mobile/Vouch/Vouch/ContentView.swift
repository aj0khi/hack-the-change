// ContentView.swift
// App shell that mirrors the website on a phone: brand header, scrolling section pills,
// then the current section. Same six sections as the web app (Proofly).

import SwiftUI

nonisolated enum AppTab: String, CaseIterable, Hashable {
    case overview, projects, credentials, lens, vouch, verification

    var title: String {
        switch self {
        case .overview: "Overview"
        case .projects: "Explore projects"
        case .credentials: "My credentials"
        case .lens: "Employer lens"
        case .vouch: "Give a vouch"
        case .verification: "Account verification"
        }
    }

    /// SF Symbols closest to the web's Lucide nav icons.
    var systemImage: String {
        switch self {
        case .overview: "square.grid.2x2"                 // layout-grid
        case .projects: "safari"                          // compass
        case .credentials: "checkmark.seal"               // badge-check
        case .lens: "text.viewfinder"                     // scan-search
        case .vouch: "hand.raised"                        // heart-handshake
        case .verification: "checkmark.shield"            // shield-check
        }
    }
}

struct ContentView: View {
    @State private var store = VouchStore()
    @State private var selection: AppTab = .overview
    @State private var vouchTask = ""
    @State private var focusedProject: String?
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                BrandHeader(selection: $selection, credentialCount: store.verified.count)
                Group {
                    switch selection {
                    case .overview: OverviewView(selection: $selection, vouchTask: $vouchTask)
                    case .projects: ProjectsView(selection: $selection, vouchTask: $vouchTask, focusedProject: $focusedProject)
                    case .credentials: CredentialsView(selection: $selection)
                    case .lens: LensView(selection: $selection, vouchTask: $vouchTask, focusedProject: $focusedProject)
                    case .vouch: VouchView(selection: $selection, task: $vouchTask)
                    case .verification: VerificationView()
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .background(VColor.paper)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: VerifiedCredential.self) { CredentialDetailView(credential: $0) }
        }
        .environment(store)
        .onChange(of: selection) {
            path = NavigationPath()
            if selection != .projects { focusedProject = nil }
        }
    }
}

/// The web's phone layout: warm white bar with the logo and scrolling section pills,
/// then a thin bar with the breadcrumb, "Prototype mode" pill and avatar.
private struct BrandHeader: View {
    @Binding var selection: AppTab
    let credentialCount: Int

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                BrandMark()
                VStack(alignment: .leading, spacing: 4) {
                    Text("proofly")
                        .font(.display(21, relativeTo: .title3))
                        .tracking(-1.05)
                        .foregroundStyle(VColor.ink)
                    Text("GOOD WORK GOES FURTHER")
                        .font(.text(8, weight: .bold, relativeTo: .caption2))
                        .tracking(1.15)
                        .foregroundStyle(VColor.overline)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Proofly")
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 10)

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(AppTab.allCases, id: \.self) { tab in
                            NavPill(tab: tab, isActive: selection == tab,
                                    count: tab == .credentials ? credentialCount : nil) {
                                selection = tab
                            }
                            .id(tab)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                }
                .onChange(of: selection) { withAnimation { proxy.scrollTo(selection, anchor: .center) } }
            }
            Rectangle().fill(VColor.line).frame(height: 1)

            HStack(spacing: 10) {
                HStack(spacing: 6) {
                    Text("WORKSPACE").foregroundStyle(VColor.breadcrumb)
                    Image(systemName: "chevron.right").font(.system(size: 8, weight: .bold)).foregroundStyle(VColor.breadcrumb)
                    Text(selection.title.uppercased()).fontWeight(.black).foregroundStyle(VColor.breadcrumbStrong)
                        .lineLimit(1)
                }
                .font(.text(10, weight: .bold, relativeTo: .caption2))
                .tracking(1)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Workspace, \(selection.title)")
                Spacer(minLength: 4)
                HStack(spacing: 6) {
                    Circle().fill(VColor.pillDot).frame(width: 6, height: 6)
                    Text("PROTOTYPE MODE").font(.text(9, weight: .bold, relativeTo: .caption2)).tracking(1)
                }
                .foregroundStyle(VColor.pillText)
                .padding(.horizontal, 11).padding(.vertical, 8)
                .background(VColor.tint, in: .capsule)
                .overlay { Capsule().strokeBorder(VColor.noticeBorder) }
                .fixedSize()
                Text("P")
                    .font(.text(14, weight: .bold))
                    .foregroundStyle(VColor.avatarText)
                    .frame(width: 32, height: 32)
                    .background(VColor.avatar, in: .circle)
                    .accessibilityLabel("Priya Sharma, student workspace, demo")
            }
            .padding(.horizontal, 18)
            .frame(minHeight: 52)
            Rectangle().fill(VColor.line).frame(height: 1)
        }
        .background(VColor.surface)
    }
}

/// Purple rounded square with "p." like the web's .brand-mark.
private struct BrandMark: View {
    var body: some View {
        (Text("p").foregroundStyle(.white) + Text(".").foregroundStyle(Color(hex: 0xE1D6F1)))
            .font(.display(30, relativeTo: .title))
            .padding(.bottom, 5)
            .frame(width: 37, height: 37)
            .background(VColor.blue, in: .rect(cornerRadius: 11))
            .accessibilityHidden(true)
    }
}

private struct NavPill: View {
    let tab: AppTab
    let isActive: Bool
    let count: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: tab.systemImage).font(.system(size: 14, weight: .medium))
                Text(tab.title)
                if let count {
                    Text("\(count)")
                        .font(.text(11, weight: .bold, relativeTo: .caption))
                        .foregroundStyle(VColor.navActiveText)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(VColor.navCount, in: .rect(cornerRadius: 4))
                }
            }
            .font(.text(14, weight: .bold, relativeTo: .subheadline))
            .foregroundStyle(isActive ? VColor.navActiveText : VColor.navText)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(isActive ? VColor.navActive : .clear, in: .rect(cornerRadius: 9))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .accessibilityLabel(count.map { "\(tab.title), \($0)" } ?? tab.title)
    }
}

#Preview {
    ContentView()
}
