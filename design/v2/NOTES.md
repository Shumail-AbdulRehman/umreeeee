# v2: motion decisions

The animate frequency gate rejects animation of typing, sending, response reading, loading older messages and chat selection. Motion here is feedback or spatial consistency, never decoration. No animation library is added.

| Element | Trigger | Purpose | Properties | Duration | Easing | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- |
| History item, new-chat link, copy control, options summary | Pointer hover/state | Feedback | Color/background/border color | 160ms | cubic-bezier(.23,1,.32,1) | Same subtle color feedback |
| Mobile history dialog | Pointer open/close | Spatial consistency | Opacity and translateX(12px); discrete native dialog visibility | 200ms | cubic-bezier(.23,1,.32,1) | Opacity only, 160ms |
| Mobile history dialog | Keyboard open/Escape close | Immediate control | No interpolation | 0ms | None | Same instant behavior |
| Composer, send, chat change, response/table/code | Typing, submit, selection, reading | High frequency; stability wins | None | 0ms | None | Same |
| Copy confirmation | Copy completion/failure | State indication | Text and live-region update | Immediate | None | Same |

Native dialog focus management and close behavior remain intact. CSS discrete transitions enhance supported browsers; no JavaScript timeout delays closing or focus return. Pointer-hover affordances do not translate or scale. No page entrances, streaming simulation, GSAP, scroll pinning or content reveals are used. Real application integration must reuse the existing shadcn/Radix dialog/popover components instead of copying prototype markup.
