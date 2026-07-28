<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Optional email integration.
 * Mirrors emailService.js.
 *
 * Enable with EMAIL_ENABLED=true in .env.
 *
 * Modes (EMAIL_MODE):
 *  log  – print email payload to laravel.log (default/safe)
 *  mail – send through Laravel's configured MAIL_MAILER
 *
 * When EMAIL_ENABLED=false every method returns early with sent=false.
 */
class EmailService
{
    // -----------------------------------------------------------------------
    // Configuration
    // -----------------------------------------------------------------------

    public function isEnabled(): bool
    {
        return strtolower((string) env('EMAIL_ENABLED', 'false')) === 'true';
    }

    public function getMode(): string
    {
        $mode = strtolower((string) env('EMAIL_MODE', ''));
        if ($mode === 'mail' || $mode === 'smtp') {
            return 'mail';
        }
        // If a real mailer host is configured and EMAIL_MODE is not explicitly "log", use mail.
        $mailer = strtolower((string) env('MAIL_MAILER', 'log'));
        return $mailer !== 'log' ? 'mail' : 'log';
    }

    private function fromAddress(): string
    {
        return (string) env('MAIL_FROM_ADDRESS', 'noreply@lectihub.local');
    }

    private function fromName(): string
    {
        return (string) env('MAIL_FROM_NAME', 'LectiHub');
    }

    // -----------------------------------------------------------------------
    // Generic send
    // -----------------------------------------------------------------------

    /**
     * Send (or log) a plain-text / HTML email.
     *
     * @return array{sent: bool, mode?: string, to?: string, reason?: string, error?: string}
     */
    public function sendEmail(string $to, string $subject, string $text, ?string $html = null): array
    {
        if (!$this->isEnabled()) {
            return ['sent' => false, 'reason' => 'disabled'];
        }

        if (!$to) {
            return ['sent' => false, 'reason' => 'missing_recipient'];
        }

        $htmlBody = $html ?? '<pre style="font-family:sans-serif;white-space:pre-wrap;">'
            . htmlspecialchars($text, ENT_QUOTES)
            . '</pre>';

        if ($this->getMode() === 'log') {
            Log::info('[email:log]', ['to' => $to, 'subject' => $subject, 'text' => $text]);
            return ['sent' => true, 'mode' => 'log', 'to' => $to];
        }

        try {
            Mail::html($htmlBody, function ($message) use ($to, $subject, $htmlBody) {
                $message
                    ->to($to)
                    ->subject($subject)
                    ->from($this->fromAddress(), $this->fromName());
            });

            return ['sent' => true, 'mode' => 'mail', 'to' => $to];
        } catch (\Throwable $e) {
            Log::error('[email:error] ' . $e->getMessage());
            return [
                'sent'   => false,
                'mode'   => 'mail',
                'to'     => $to,
                'reason' => 'send_failed',
                'error'  => $e->getMessage(),
            ];
        }
    }

    // -----------------------------------------------------------------------
    // Schedule-confirmation emails (student + teacher)
    // -----------------------------------------------------------------------

    /**
     * Build the email subject + body for a schedule-confirmation message.
     *
     * @param  array<string,mixed>  $details
     *   classDate, startTime, endTime, durationMinutes, teacherName|studentName, subject,
     *   meetingInfo, meetingLink
     *
     * @return array{subject: string, text: string}
     */
    public function buildScheduleEmailBodies(string $role, array $details): array
    {
        $scheduleLine = sprintf(
            '%s %s – %s (%d minutes)',
            $details['classDate']       ?? '',
            $details['startTime']       ?? '',
            $details['endTime']         ?? '',
            $details['durationMinutes'] ?? 60
        );

        if ($role === 'student') {
            $text = implode("\n", [
                'Your LectiHub class schedule is confirmed.',
                '',
                'Assigned teacher: ' . ($details['teacherName'] ?? ''),
                'Schedule: ' . $scheduleLine,
                'Subject: '  . ($details['subject']     ?? 'General'),
                'Meeting information: ' . ($details['meetingInfo'] ?? ''),
                'Meeting link: '        . ($details['meetingLink'] ?? ''),
                '',
                'You will also receive in-app reminder notifications before class begins.',
            ]);

            return ['subject' => 'LectiHub confirmation: your class schedule', 'text' => $text];
        }

        // teacher
        $text = implode("\n", [
            'A LectiHub class has been assigned to you.',
            '',
            'Assigned student: ' . ($details['studentName']    ?? ''),
            'Date and time: '   . $scheduleLine,
            'Class duration: '  . ($details['durationMinutes'] ?? 60) . ' minutes',
            'Subject: '         . ($details['subject']         ?? 'General'),
            'Meeting details: ' . ($details['meetingInfo']     ?? ''),
            'Meeting link: '    . ($details['meetingLink']     ?? ''),
        ]);

        return ['subject' => 'LectiHub confirmation: new class assignment', 'text' => $text];
    }

    /**
     * Send assignment-confirmation emails to both student and teacher.
     *
     * @param  array{id?: int, email?: string, full_name?: string}|null  $student
     * @param  array{id?: int, email?: string, full_name?: string}|null  $teacher
     * @param  array<string,mixed>  $details  See buildScheduleEmailBodies
     *
     * @return array{
     *   enabled: bool,
     *   mode?: string,
     *   sent: list<array{recipient: string, email?: string, sent: bool, reason?: string}>
     * }
     */
    public function sendScheduleConfirmationEmails(
        ?array $student,
        ?array $teacher,
        array $details
    ): array {
        if (!$this->isEnabled()) {
            return ['enabled' => false, 'sent' => []];
        }

        $results = [];

        if (!empty($student['email'])) {
            $body      = $this->buildScheduleEmailBodies('student', array_merge($details, [
                'teacherName' => $teacher['full_name'] ?? $teacher['username'] ?? '',
            ]));
            $result    = $this->sendEmail($student['email'], $body['subject'], $body['text']);
            $results[] = array_merge(['recipient' => 'student', 'email' => $student['email']], $result);
        } else {
            $results[] = ['recipient' => 'student', 'sent' => false, 'reason' => 'missing_email'];
        }

        if (!empty($teacher['email'])) {
            $body      = $this->buildScheduleEmailBodies('teacher', array_merge($details, [
                'studentName' => $student['full_name'] ?? $student['username'] ?? '',
            ]));
            $result    = $this->sendEmail($teacher['email'], $body['subject'], $body['text']);
            $results[] = array_merge(['recipient' => 'teacher', 'email' => $teacher['email']], $result);
        } else {
            $results[] = ['recipient' => 'teacher', 'sent' => false, 'reason' => 'missing_email'];
        }

        return [
            'enabled' => true,
            'mode'    => $this->getMode(),
            'sent'    => $results,
        ];
    }
}
