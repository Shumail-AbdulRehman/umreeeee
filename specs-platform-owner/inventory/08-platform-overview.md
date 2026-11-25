# Platform overview reuse

PlatformOverview.jsx exports a default component taking {days=7,onDaysChange}. It calls getPlatformOverview through usePlatformResource and composes the shared presentation. It does not own navigation state or synthesize runtime sample data.
