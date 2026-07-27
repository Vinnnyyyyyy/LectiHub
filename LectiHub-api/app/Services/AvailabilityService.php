<?php

namespace App\Services;

use App\Models\TeacherAvailability;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonImmutable;

class AvailabilityService
{
    /**
     * 30-minute reservation slots (lunch gap 12:00–13:00).
     * Mirrors STANDARD_TIME_SLOTS in availabilityHelpers.js.
     */
    public const STANDARD_TIME_SLOTS = [
        '09:00-09:30', '09:30-10:00',
        '10:00-10:30', '10:30-11:00',
        '11:00-11:30', '11:30-12:00',
        '13:00-13:30', '13:30-14:00',
        '14:00-14:30', '14:30-15:00',
        '15:00-15:30', '15:30-16:00',
        '16:00-16:30', '16:30-17:00',
        '17:00-17:30', '17:30-18:00',
    ];

    /** Students may only book on/after today + this many calendar days. */
    public const DEFAULT_BOOKING_LEAD_DAYS = 2;

    /** Mon–Fri (Carbon/PHP: 1=Mon … 7=Sun, ISO-8601). */
    public const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

    /**
     * Effective booking lead from env (falls back to the constant).
     */
    public function bookingLeadDays(): int
    {
        $val = (int) env('BOOKING_LEAD_DAYS', self::DEFAULT_BOOKING_LEAD_DAYS);
        return $val > 0 ? $val : self::DEFAULT_BOOKING_LEAD_DAYS;
    }

    /**
     * Returns the earliest date (Y-m-d) that a student may book from now.
     */
    public function earliestBookableDate(?Carbon $from = null): string
    {
        $from = ($from ?? Carbon::today())->copy()->startOfDay();
        return $from->addDays($this->bookingLeadDays())->toDateString();
    }

    /**
     * ISO weekday of a Y-m-d string: 1 (Mon) – 7 (Sun).
     * Returns null when the string is not a valid date.
     */
    public function weekdayOf(string $isoDate): ?int
    {
        try {
            return CarbonImmutable::createFromFormat('Y-m-d', $isoDate)->dayOfWeekIso;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Seed Mon–Fri × every STANDARD_TIME_SLOT row for a teacher if missing.
     * Safe to call repeatedly (INSERT OR IGNORE equivalent via firstOrCreate).
     */
    public function ensureDefaultTeacherAvailability(int $teacherId): void
    {
        foreach (self::DEFAULT_WEEKDAYS as $weekday) {
            foreach (self::STANDARD_TIME_SLOTS as $slot) {
                TeacherAvailability::firstOrCreate(
                    [
                        'teacher_id' => $teacherId,
                        'weekday'    => $weekday,
                        'time_slot'  => $slot,
                    ],
                    ['is_open' => true]
                );
            }
        }
    }

    /**
     * Seed defaults for every teacher that currently exists in the DB.
     */
    public function seedAllTeachers(): void
    {
        User::where('role', 'teacher')->each(
            fn (User $t) => $this->ensureDefaultTeacherAvailability($t->id)
        );
    }

    /**
     * Return the weekly availability template for a teacher as an array of:
     *   [ weekday (int), timeSlot (string), isOpen (bool) ]
     */
    public function getTeacherWeeklyAvailability(int $teacherId): array
    {
        return TeacherAvailability::where('teacher_id', $teacherId)
            ->orderBy('weekday')
            ->orderBy('time_slot')
            ->get()
            ->map(fn ($row) => [
                'weekday'  => $row->weekday,
                'timeSlot' => $row->time_slot,
                'isOpen'   => (bool) $row->is_open,
            ])
            ->all();
    }

    /**
     * Fully replace a teacher's weekly availability template.
     *
     * @param  array<array{weekday: int, timeSlot: string, isOpen: bool}>  $slots
     */
    public function replaceTeacherWeeklyAvailability(int $teacherId, array $slots): void
    {
        TeacherAvailability::where('teacher_id', $teacherId)->delete();

        $rows = array_map(fn ($s) => [
            'teacher_id' => $teacherId,
            'weekday'    => (int) $s['weekday'],
            'time_slot'  => $s['timeSlot'],
            'is_open'    => !empty($s['isOpen']) ? 1 : 0,
        ], $slots);

        if ($rows) {
            TeacherAvailability::insert($rows);
        }
    }

    /**
     * Does a teacher's weekly template say the given slot is open on the
     * weekday that corresponds to $preferredDate?
     */
    public function teacherOffersSlot(int $teacherId, string $preferredDate, string $timeSlot): bool
    {
        $weekday = $this->weekdayOf($preferredDate);
        if ($weekday === null) {
            return false;
        }

        $row = TeacherAvailability::where('teacher_id', $teacherId)
            ->where('weekday', $weekday)
            ->where('time_slot', $timeSlot)
            ->first();

        return $row ? (bool) $row->is_open : false;
    }

    /**
     * Build the open-slot inventory for students over a date range.
     *
     * $hasConflict is a callable(teacherId, isoDate, timeSlot): bool
     * injected from ConflictService to keep this class dependency-free.
     *
     * @param  User[]  $teachers
     * @param  callable(int, string, string): bool  $hasConflict
     */
    public function buildOpenInventory(
        string $fromIso,
        string $toIso,
        array $teachers,
        callable $hasConflict
    ): array {
        $dates     = [];
        $openDates = [];

        $this->eachDateInRange($fromIso, $toIso, function (string $isoDate) use (
            $teachers,
            $hasConflict,
            &$dates,
            &$openDates
        ) {
            $slots = [];
            foreach (self::STANDARD_TIME_SLOTS as $timeSlot) {
                $count = 0;
                foreach ($teachers as $teacher) {
                    if (!$this->teacherOffersSlot($teacher->id, $isoDate, $timeSlot)) {
                        continue;
                    }
                    if ($hasConflict($teacher->id, $isoDate, $timeSlot)) {
                        continue;
                    }
                    $count++;
                }
                if ($count > 0) {
                    $slots[] = [
                        'timeSlot'              => $timeSlot,
                        'availableTeacherCount' => $count,
                    ];
                }
            }
            if (count($slots) > 0) {
                $dates[]     = ['date' => $isoDate, 'slots' => $slots];
                $openDates[] = $isoDate;
            }
        });

        return [
            'from'      => $fromIso,
            'to'        => $toIso,
            'timeSlots' => self::STANDARD_TIME_SLOTS,
            'dates'     => $dates,
            'openDates' => $openDates,
        ];
    }

    /**
     * Iterate every calendar date in [fromIso, toIso] calling $callback(isoDate).
     */
    public function eachDateInRange(string $fromIso, string $toIso, callable $callback): void
    {
        try {
            $cursor = CarbonImmutable::createFromFormat('Y-m-d', $fromIso)->startOfDay();
            $end    = CarbonImmutable::createFromFormat('Y-m-d', $toIso)->startOfDay();
        } catch (\Throwable) {
            return;
        }

        if ($cursor->gt($end)) {
            return;
        }

        while ($cursor->lte($end)) {
            $callback($cursor->toDateString());
            $cursor = $cursor->addDay();
        }
    }
}
