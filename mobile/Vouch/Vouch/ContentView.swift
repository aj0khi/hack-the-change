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

    var systemImage: String {
        switch self {
        case .overview: "square.grid.2x2"
        case .projects: "safari"
        case .credentials: "rosette"
        case .lens: "briefcase"
        case .vouch: "bubble.left.and.text.bubble.right"
        case .verification: "checkmark.shield"
        }
    }
}

struct ContentView: View {
    @State private var store = VouchStore()
    @State private var selection: AppTab = .overview
    @State private var vouchTask = ""
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                BrandHeader(selection: $selection, credentialCount: store.verified.count)
                Group {
                    switch selection {
                    case .overview: OverviewView(selection: $selection, vouchTask: $vouchTask)
                    case .projects: ProjectsView(selection: $selection, vouchTask: $vouchTask)
                    case .credentials: CredentialsView(selection: $selection)
                    case .lens: LensView(selection: $selection, vouchTask: $vouchTask)
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
        .onChange(of: selection) { path = NavigationPath() }
    }
}

/// White top area: logo, prototype pill, avatar, and the section pills (the web's phone layout).
private struct BrandHeader: View {
    @Binding var selection: AppTab
    let credentialCount: Int

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                BrandMark()
                VStack(alignment: .leading, spacing: 5) {
                    Text("proofly")
                        .font(.display(21, relativeTo: .title3))
                        .foregroundStyle(VColor.ink)
                    Text("GOOD WORK GOES FURTHER")
                        .font(.text(8, weight: .bold, relativeTo: .caption2))
                        .tracking(1)
                        .foregroundStyle(Color(hex: 0xA6AFAC))
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Proofly")
                Spacer()
                HStack(spacing: 5) {
                    Circle().fill(VColor.pillDot).frame(width: 6, height: 6)
                    Text("PROTOTYPE").font(.text(9, weight: .bold, relativeTo: .caption2)).tracking(1)
                }
                .foregroundStyle(VColor.pillText)
                .padding(.horizontal, 8).padding(.vertical, 7)
                .background(VColor.noticeBackground, in: .rect(cornerRadius: 4))
                Text("P")
                    .font(.text(13, weight: .bold))
                    .foregroundStyle(VColor.avatarText)
                    .frame(width: 32, height: 32)
                    .background(VColor.avatar, in: .circle)
                    .accessibilityLabel("Priya Sharma, student workspace, demo")
            }
            .padding(.horizontal, 18)
            .padding(.top, 8)
            .padding(.bottom, 12)

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
        }
        .background(.white)
    }
}

private struct BrandMark: View {
    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 11).fill(VColor.blue)
            Text("p")
                .font(.display(30, relativeTo: .title))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .offset(y: -3)
            Circle().fill(Color(hex: 0xFFC49C)).frame(width: 5, height: 5).offset(x: 6, y: 9)
        }
        .frame(width: 37, height: 37)
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
                Text(tab.title)
                if let count {
                    Text("\(count)")
                        .font(.text(11, weight: .bold, relativeTo: .caption))
                        .foregroundStyle(VColor.blue)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(VColor.navCount, in: .rect(cornerRadius: 4))
                }
            }
            .font(.text(14, weight: .bold, relativeTo: .subheadline))
            .foregroundStyle(isActive ? VColor.blue : VColor.navText)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(isActive ? VColor.navActive : .clear, in: .rect(cornerRadius: 5))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .accessibilityLabel(count.map { "\(tab.title), \($0)" } ?? tab.title)
    }
}

#Preview {
    ContentView()
}
