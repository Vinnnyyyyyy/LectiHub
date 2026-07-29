<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Dolibarr CRM
    |--------------------------------------------------------------------------
    |
    | Used by DolibarrClient for free-trial intake and optional invoicing.
    | Set DOLIBARR_MODE=log for local dev (no real API calls).
    |
    */

    'dolibarr' => [
        'enabled' => env('DOLIBARR_ENABLED', false),
        'mode'    => env('DOLIBARR_MODE', 'log'),
        'api_url' => env('DOLIBARR_API_URL', ''),
        'api_key' => env('DOLIBARR_API_KEY', ''),
    ],

    /*
    |--------------------------------------------------------------------------
    | Meeting / Video providers
    |--------------------------------------------------------------------------
    |
    | Used by ScheduleMapper to build meeting links and join-window logic.
    |
    */

    'meetings' => [
        'provider'           => env('MEETING_PROVIDER', 'jitsi'),
        'allow_early_join'   => env('MEETING_ALLOW_EARLY_JOIN', true),
        'join_minutes_before'=> env('MEETING_JOIN_MINUTES_BEFORE', 15),
        'join_minutes_after' => env('MEETING_JOIN_MINUTES_AFTER', 15),
        'jitsi_base_url'     => env('JITSI_BASE_URL', 'https://meet.jit.si'),
        'google_meet_base_url'   => env('GOOGLE_MEET_BASE_URL', 'https://meet.google.com'),
        'zoom_link_template' => env('ZOOM_MEETING_LINK_TEMPLATE', 'https://zoom.us/j/{room}'),
        'digital_samba_base_url' => env('DIGITAL_SAMBA_BASE_URL', 'https://room.digitalsamba.com'),
    ],

];
