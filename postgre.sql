-- Создание таблицы пользователей
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    telegram_login VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    volunteer_experience VARCHAR(10) NOT NULL,
    coins INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы администраторов
CREATE TABLE IF NOT EXISTS public.admins (
    id SERIAL PRIMARY KEY,
    telegram_login VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы вопросов для викторины
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_date DATE NOT NULL,
    question TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_answer VARCHAR(1) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы попыток прохождения викторины
CREATE TABLE IF NOT EXISTS public.user_quiz_attempts (
    id SERIAL PRIMARY KEY,
    telegram_login VARCHAR(100) NOT NULL,
    quiz_date DATE NOT NULL,
    correct_answers_count INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_login) REFERENCES public.users(telegram_login) ON DELETE CASCADE,
    UNIQUE (telegram_login, quiz_date)
);

-- Создание таблицы медиа-файлов (лотов для аукциона)
CREATE TABLE IF NOT EXISTS public.media_files (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    file_data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы добрых дел
CREATE TABLE IF NOT EXISTS public.good_deeds (
    id SERIAL PRIMARY KEY,
    telegram_login VARCHAR(100) NOT NULL,
    photo_id VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_login) REFERENCES public.users(telegram_login) ON DELETE CASCADE
);

-- Создание таблицы кодовых слов
CREATE TABLE IF NOT EXISTS public.codes (
    id SERIAL PRIMARY KEY,
    code_word VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание таблицы использованных кодов
CREATE TABLE IF NOT EXISTS public.used_codes (
    id SERIAL PRIMARY KEY,
    telegram_login VARCHAR(100) NOT NULL,
    code_word VARCHAR(100) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (telegram_login) REFERENCES public.users(telegram_login) ON DELETE CASCADE,
    FOREIGN KEY (code_word) REFERENCES public.codes(code_word) ON DELETE CASCADE,
    UNIQUE (telegram_login, code_word)
);

-- Создание индексов для улучшения производительности
CREATE INDEX IF NOT EXISTS idx_users_telegram_login ON public.users(telegram_login);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_date ON public.quiz_questions(quiz_date);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_telegram_login ON public.user_quiz_attempts(telegram_login);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_quiz_date ON public.user_quiz_attempts(quiz_date);
CREATE INDEX IF NOT EXISTS idx_good_deeds_status ON public.good_deeds(status);
CREATE INDEX IF NOT EXISTS idx_good_deeds_telegram_login ON public.good_deeds(telegram_login);
CREATE INDEX IF NOT EXISTS idx_used_codes_telegram_login ON public.used_codes(telegram_login);

-- Добавление тестовых администраторов
INSERT INTO public.admins (telegram_login) VALUES 
('admin1'),
('admin2')
ON CONFLICT (telegram_login) DO NOTHING;

-- Добавление тестовых пользователей
INSERT INTO public.users (telegram_login, full_name, volunteer_experience, coins) VALUES 
('user1', 'Иван Иванов', '12', 100),
('user2', 'Петр Петров', '6', 50),
('user3', 'Сергей Сергеев', '3', 25),
('admin1', 'Администратор Администратович', '24', 500)
ON CONFLICT (telegram_login) DO NOTHING;

-- Добавление тестовых кодов
INSERT INTO public.codes (code_word) VALUES 
('добро2023'),
('волонтер'),
('помощь'),
('вместемысила')
ON CONFLICT (code_word) DO NOTHING;

-- Добавление тестовых вопросов для викторины (на сегодня)
INSERT INTO public.quiz_questions (quiz_date, question, option_a, option_b, option_c, option_d, correct_answer) VALUES 
(CURRENT_DATE, 'Какой международный день празднуется 5 декабря?', 'День волонтера', 'День защиты детей', 'День пожилых людей', 'День матери', 'A'),
(CURRENT_DATE, 'Как называется крупнейшая волонтерская организация в России?', 'Волонтеры Победы', 'Добровольцы России', 'Союз добровольцев России', 'Все перечисленные', 'D'),
(CURRENT_DATE, 'Сколько часов волонтерской работы нужно для получения знака "Волонтер России"?', '100', '150', '200', '250', 'B')
ON CONFLICT DO NOTHING;

-- Добавление тестовых лотов для аукциона
-- Примечание: В реальной БД нужно добавить реальные бинарные данные для file_data
INSERT INTO public.media_files (title, description, file_data) VALUES 
('Кружка с логотипом', 'Эксклюзивная кружка с логотипом организации', E'\\x'),
('Футболка волонтера', 'Стильная футболка с принтом', E'\\x'),
('Значок "Лучший волонтер"', 'Эксклюзивный значок для лучших волонтеров', E'\\x')
ON CONFLICT DO NOTHING;

-- Добавление использованных кодов
INSERT INTO public.used_codes (telegram_login, code_word) VALUES 
('user1', 'добро2023'),
('user2', 'волонтер')
ON CONFLICT (telegram_login, code_word) DO NOTHING;

-- Добавление тестовых добрых дел
INSERT INTO public.good_deeds (telegram_login, photo_id, description, status) VALUES 
('user1', 'photo1', 'Помог пожилому человеку перейти дорогу', 'successful'),
('user2', 'photo2', 'Убрал мусор в парке', 'pending'),
('user3', 'photo3', 'Провел мастер-класс для детей', 'rejected')
ON CONFLICT DO NOTHING;