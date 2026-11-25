# v2 motion decisions

| Element | Trigger and intent | Property | Timing and curve | Reduced motion |
| --- | --- | --- | --- | --- |
| Access dialog | Open or close to show a protected decision | Transform and opacity | 200ms strong ease-out | Immediate |
| Dialog backdrop | Open or close to indicate the active layer | Opacity | 200ms strong ease-out | Immediate |
| Action buttons | Press to acknowledge a pointer or touch action | Transform | 140ms strong ease-out | Immediate |
| Charts, tables, and navigation | Frequently read and used | Stable layout | Immediate | Immediate |

Native dialog focus and dismissal work independently of motion.
