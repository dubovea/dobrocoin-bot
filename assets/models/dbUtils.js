const dbClient = require("./dbConnection");
const { buttons, messages } = require("./constants");

async function getUserCoins(telegramLogin) {
  try {
    const result = await dbClient.query(
      `SELECT coins FROM public.users 
        WHERE LOWER(telegram_login) = LOWER($1)
        LIMIT 1`,
      [telegramLogin]
    );
    return result.rows.length > 0 ? result.rows[0].coins : 0;
  } catch (err) {
    console.error("Ошибка при получении количества коинов:", err);
    throw err; // выбрасываем ошибку, чтобы можно было обработать её на уровне вызова
  }
}

async function startQuiz(ctx) {
  const telegramLogin = ctx.from.username;
  const today = getDateString();
  const finished = {
    byAlready: false,
    byNonQuiz: false,
  };

  // Проверка, проходил ли пользователь викторину сегодня
  const quizAttempt = await dbClient.query(
    `SELECT * FROM user_quiz_attempts WHERE LOWER(telegram_login) = LOWER($1) AND quiz_date = $2`,
    [telegramLogin, today]
  );

  if (quizAttempt.rows.length > 0) {
    finished.byAlready = true;
    return finished;
  }

  // Получаем вопросы из базы данных
  const questions = await dbClient.query(
    `SELECT * FROM quiz_questions WHERE quiz_date = $1`,
    [today] // Выбираем тему викторины
  );

  if (!questions.rows.length) {
    finished.byNonQuiz = true;
    return finished;
  }

  if (!ctx.session) {
    ctx.session = {};
  }

  // Сохраняем состояние викторины
  ctx.session.quiz = {
    questions: questions.rows,
    currentQuestionIndex: 0,
    correctAnswersCount: 0,
  };

  // Отправляем первый вопрос
  sendNextQuestion(ctx);
}

// Функция для отправки вопроса и ответов
async function sendNextQuestion(ctx) {
  const quiz = ctx.session.quiz;

  if (quiz.currentQuestionIndex >= quiz.questions.length) {
    return completeQuiz(ctx);
  }

  const question = quiz.questions[quiz.currentQuestionIndex];
  // Формируем текст вопроса с доступными вариантами ответа
  let questionText = `${question.question}`;
  const options = [];

  if (question.option_a) {
    questionText += `\nA) ${question.option_a}`;
    options.push({ text: buttons.option_A, callback_data: buttons.option_A });
  }
  if (question.option_b) {
    questionText += `\nB) ${question.option_b}`;
    options.push({ text: buttons.option_B, callback_data: buttons.option_B });
  }
  if (question.option_c) {
    questionText += `\nC) ${question.option_c}`;
    options.push({ text: buttons.option_C, callback_data: buttons.option_C });
  }
  if (question.option_d) {
    questionText += `\nD) ${question.option_d}`;
    options.push({ text: buttons.option_D, callback_data: buttons.option_D });
  }

  // Разделяем кнопки по строкам (максимум 2 кнопки в одной строке)
  const keyboard = [];
  for (let i = 0; i < options.length; i += 2) {
    keyboard.push(options.slice(i, i + 2));
  }

  // Отправляем вопрос с динамически сформированной клавиатурой
  await ctx.reply(questionText, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

// Завершение викторины и начисление коинов
async function completeQuiz(ctx) {
  const quiz = ctx.session.quiz;
  const telegramLogin = ctx.from.username;
  const coinsEarned = quiz.correctAnswersCount * 20;

  await dbClient.query(
    `UPDATE users SET coins = coins + $1 WHERE LOWER(telegram_login) = LOWER($2)`,
    [coinsEarned, telegramLogin]
  );
  // Сохранение попытки
  const today = getDateString();
  await dbClient.query(
    `INSERT INTO user_quiz_attempts (telegram_login, quiz_date, correct_answers_count) VALUES (LOWER($1), $2, $3)`,
    [telegramLogin, today, quiz.correctAnswersCount]
  );

  const totalCoins = await getUserCoins(telegramLogin);
  const messageTotalCoins = messages.totalCoins(totalCoins);
  delete ctx.session.quiz;
  return ctx.reply(
    `Викторина завершена! Вы ответили правильно на ${quiz.correctAnswersCount} и заработали ${coinsEarned} коинов. ${messageTotalCoins}`
  );
}

function getDateString() {
  const date = new Date();
  const formattedDate = date.toLocaleDateString("en-CA"); // Формат "yyyy-mm-dd"
  return formattedDate;
}

module.exports = {
  getUserCoins,
  startQuiz,
  sendNextQuestion,
  getDateString,
};
