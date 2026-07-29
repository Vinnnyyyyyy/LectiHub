<?php

namespace App\Services;

use App\Models\CalendarEvent;
use App\Models\LectiClass;

/**
 * Checks whether a teacher has a scheduling conflict for a given date + slot.
 * Mirrors conflictHelpers.js + teacherHasCalendarConflict from calendarService.js.
 */
class ConflictService
{
    /**
     * Parse "HH:MM-HH:MM" time slot into minute bounds.
     *
     * @return array{start: int, end: int, startTime: string, endTime: string}|null
     */
    public function slotBounds(?string $timeSlot): ?array
    {
        if (!$timeSlot) {
            return null;
        }

        [$startRaw, $endRaw] = array_pad(explode('-', (string) $timeSlot, 2), 2, null);

        $toMinutes = function (?string $value): ?int {
            if ($value === null) {
                return null;
            }
            $parts = explode(':', $value);
            if (count($parts) < 2 || !is_numeric($parts[0]) || !is_numeric($parts[1])) {
                return null;
            }
            return (int) $parts[0] * 60 + (int) $parts[1];
        };

        $start = $toMinutes($startRaw);
        $end   = $toMinutes($endRaw);

        if ($start === null || $end === null || $end <= $start) {
            return null;
        }

        return [
            'start'     => $start,
            'end'       => $end,
            'startTime' => (string) $startRaw,
            'endTime'   => (string) $endRaw,
        ];
    }

    /**
     * True when two [start, end) minute intervals overlap.
     *
     * @param  array{start: int, end: int}  $a
     * @param  array{start: int, end: int}  $b
     */
    public function rangesOverlap(array $a, array $b): bool
    {
        return $a['start'] < $b['end'] && $b['start'] < $a['end'];
    }

    /**
     * Check whether a teacher is already booked (class or calendar event)
     * at the given date + time slot.
     *
     * Returns a conflict descriptor array on conflict, or null when free.
     *
     * @return array{id: int, title: string, class_date: string, time_slot: string}|null
     */
    public function teacherHasConflict(int $teacherId, string $preferredDate, string $timeSlot): ?array
    {
        $requested = $this->slotBounds($timeSlot);
        if ($requested === null) {
            return null;
        }

        // --- 1. Check confirmed / in-progress classes ----------------------
        $classes = LectiClass::where('teacher_id', $teacherId)
            ->where('class_date', $preferredDate)
            ->whereNotIn('status', ['cancelled'])
            ->select(['id', 'title', 'class_date', 'time_slot', 'start_time', 'end_time'])
            ->get();

        foreach ($classes as $cls) {
            $existing = ($cls->start_time && $cls->end_time)
                ? $this->slotBounds("{$cls->start_time}-{$cls->end_time}")
                : $this->slotBounds($cls->time_slot);

            if ($existing && $this->rangesOverlap($requested, $existing)) {
                return [
                    'id'         => $cls->id,
                    'title'      => $cls->title ?? "Class #{$cls->id}",
                    'class_date' => $cls->class_date,
                    'time_slot'  => $cls->time_slot,
                ];
            }
        }

        // --- 2. Check local calendar events --------------------------------
        $calConflict = $this->teacherHasCalendarConflict($teacherId, $preferredDate, $timeSlot);
        if ($calConflict !== null) {
            return [
                'id'         => $calConflict['id'],
                'title'      => $calConflict['title'] ?? "Calendar ({$calConflict['provider']})",
                'class_date' => $preferredDate,
                'time_slot'  => $timeSlot,
            ];
        }

        return null;
    }

    /**
     * Returns the first calendar event that overlaps the requested slot, or null.
     *
     * @return array{id: int, title: ?string, provider: string}|null
     */
    public function teacherHasCalendarConflict(
        int $teacherId,
        string $eventDate,
        string $timeSlot
    ): ?array {
        $requested = $this->slotBounds($timeSlot);
        if ($requested === null) {
            return null;
        }

        $events = CalendarEvent::where('user_id', $teacherId)
            ->where('event_date', $eventDate)
            ->whereIn('sync_status', ['synced', 'local_only', 'pending'])
            ->whereNotNull('start_time')
            ->whereNotNull('end_time')
            ->select(['id', 'title', 'provider', 'start_time', 'end_time'])
            ->get();

        foreach ($events as $event) {
            $existing = $this->slotBounds("{$event->start_time}-{$event->end_time}");
            if ($existing && $this->rangesOverlap($requested, $existing)) {
                return [
                    'id'       => $event->id,
                    'title'    => $event->title,
                    'provider' => $event->provider ?? 'lectihub',
                ];
            }
        }

        return null;
    }
}
