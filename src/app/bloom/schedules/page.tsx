"use client";

import {ScheduleList} from "@/components/bloom/schedule-list";
import {useSchedules} from "@/hooks/use-bloom";

export default function SchedulesIndex() {
    const {schedules, loading, refresh} = useSchedules();
    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-xl font-semibold">Schedules</h2>
                <p className="text-sm text-orchid-muted">
                    Cron / interval schedules.  Toggle to enable / disable
                    without editing YAML.  Admin only.
                </p>
            </header>
            <ScheduleList
                schedules={schedules}
                loading={loading}
                onRefresh={refresh}
            />
        </div>
    );
}
