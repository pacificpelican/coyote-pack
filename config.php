<?php
/*
 * Coyote Pack configuration.
 *
 * Run locally:   php -S localhost:8000 -t public
 *
 * Put private overrides (API keys, MySQL credentials) in config.local.php, which
 * returns an array with the same shape and is merged over these defaults.
 * Secrets can also come from environment variables (see the 'key' entries below).
 */
return [
    'storage' => [
        // auto  = MySQL if 'mysql.user' is set, else SQLite if pdo_sqlite is available, else JSON files
        // sqlite | mysql | json to force one
        'driver'      => 'auto',
        'sqlite_path' => __DIR__ . '/data/coyote.sqlite',
        'json_dir'    => __DIR__ . '/data/json',
        // Optional MySQL / MariaDB. Create an empty database; tables are created automatically.
        'mysql' => [
            'host'     => '127.0.0.1',
            'port'     => 3306,
            'database' => 'coyote_pack',
            'user'     => '',
            'password' => '',
            'charset'  => 'utf8mb4',
        ],
    ],

    // Animal dialogue. When disabled or unreachable, built-in lines are used instead.
    'ai' => [
        'enabled'         => true,
        // ollama (default, local) | openai (any OpenAI-compatible API) | anthropic | gemini
        'provider'        => 'ollama',
        'timeout'         => 10,
        'backoff_seconds' => 45,   // pause AI calls this long after a failure
        'ollama' => [
            'url'   => 'http://localhost:11434',
            'model' => 'llama3.2',
        ],
        // Works with OpenAI, Groq, OpenRouter, Together, Mistral, LM Studio, etc. Change url/model to match.
        'openai' => [
            'url'   => 'https://api.openai.com/v1',
            'model' => 'gpt-4o-mini',
            'key'   => getenv('OPENAI_API_KEY') ?: '',
        ],
        'anthropic' => [
            'url'   => 'https://api.anthropic.com/v1',
            'model' => 'claude-3-5-haiku-latest',
            'key'   => getenv('ANTHROPIC_API_KEY') ?: '',
        ],
        'gemini' => [
            'url'   => 'https://generativelanguage.googleapis.com/v1beta',
            'model' => 'gemini-1.5-flash',
            'key'   => getenv('GEMINI_API_KEY') ?: '',
        ],
    ],
];
