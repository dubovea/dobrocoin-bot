require("dotenv").config();
const { Telegraf, Markup, session } = require("telegraf");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  buttons,
  messages,
  errors,
  status,
} = require("./assets/models/constants");
const dbClient = require("./assets/models/dbConnection");
const {
  getUserCoins,
  startQuiz,
  sendNextQuestion,
  getDateString,
} = require("./assets/models/dbUtils");
const {
  checkRegistration,
  addUser,
  isAdmin,
} = require("./assets/models/registration");

// Глобальный объект для хранения данных сессий пользователей
const userSessions = new Map();

const bot = new Telegraf(process.env.BOT_TOKEN);
// Подключаем session middleware с использованием PostgreSQL хранилища
bot.use(session());

let tempMenu = [[buttons.getCoins], [buttons.totalCoins], [buttons.lots]];
const userMenu = Markup.keyboard(tempMenu).resize();
const adminMenu = Markup.keyboard([
  ...tempMenu,
  [buttons.checkGoodDeeds],
  [buttons.statistics],
]).resize();

const subMenu = Markup.keyboard([
  [buttons.attendEvent],
  [buttons.goodDeedEvent],
  [buttons.quiz],
  [buttons.back],
]).resize();

// Стартовая команда
bot.start(async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = "registration";
  const { isRegistered, isAdminUser } = await checkRegistration(ctx);
  try {
    if (!isRegistered) {
      await ctx.reply(messages.notRegistered);
      return;
    }
    const finalMenu = isAdminUser ? adminMenu : userMenu;
    await ctx.reply(messages.welcome, finalMenu);
  } catch (err) {
    console.error(errors.userCheckError, err);
    ctx.reply(errors.userCheckError);
  }
});

// Кнопка "Назад" из подменю
bot.hears(buttons.back, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  const isAdminUser = await isAdmin(ctx);
  const finalMenu = isAdminUser ? adminMenu : userMenu;
  await ctx.reply(messages.selectAction, finalMenu);
});

// Обработка команды "Получить доброкоины"
bot.hears(buttons.getCoins, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  await ctx.reply(messages.selectAction, subMenu);
});
// Обработка команды "Сколько у меня доброкоинов"
bot.hears(buttons.totalCoins, async (ctx) => {
  const totalCoins = await getUserCoins(ctx.from.username);
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  await ctx.reply(messages.totalCoins(totalCoins));
});
// Обработка команды "Лоты на аукционе"
bot.hears(buttons.lots, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  const lots = await dbClient.query(
    "SELECT * FROM public.media_files ORDER BY id ASC"
  );

  for (const lot of lots.rows) {
    await ctx.replyWithPhoto(
      { source: lot.file_data },
      {
        caption: `${lot.title}\n\n${lot.description.replaceAll("/n", "\n")}`,
      }
    );
  }
});

// Обработка кнопки "Проверка добрых дел"
bot.hears(buttons.checkGoodDeeds, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  const isAdminUser = await isAdmin(ctx);
  if (!isAdminUser) {
    await ctx.reply(messages.insufficientPermissions);
    return;
  }

  const goodDeeds = await dbClient.query(
    `SELECT * FROM public.good_deeds WHERE status = '${status.pending}' ORDER BY id ASC`
  );
  if (goodDeeds.rows.length === 0) {
    await ctx.reply(messages.noGoodDeeds);
  } else {
    for (const deed of goodDeeds.rows) {
      await ctx.replyWithPhoto(deed.photo_id, {
        caption: messages.goodDeedNotification(
          deed.telegram_login,
          deed.id,
          deed.description
        ),
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttons.confirmGoodDeed,
                callback_data: `confirm_${deed.id}`,
              },
              {
                text: buttons.rejectGoodDeed,
                callback_data: `reject_${deed.id}`,
              },
            ],
          ],
        },
      });
    }
  }
});

// Обработка нажатия кнопки "Подтвердить"
bot.action(/confirm_(\d+)/, async (ctx) => {
  const deedId = ctx.match[1];
  try {
    // Получаем информацию о добром деле, чтобы знать telegram_login
    const deed = await dbClient.query(
      `SELECT telegram_login FROM public.good_deeds WHERE id = $1`,
      [deedId]
    );

    if (deed.rows.length === 0) {
      await ctx.reply(errors.goodDeedNotFound);
      return;
    }

    const telegramLogin = deed.rows[0].telegram_login;

    await dbClient.query(
      `UPDATE public.good_deeds SET status = '${status.successful}' WHERE id = $1`,
      [deedId]
    );
    await dbClient.query(
      `UPDATE public.users SET coins = coins + $1 WHERE LOWER(telegram_login) = LOWER($2)`,
      [30, telegramLogin]
    );

    try {
      // Удаление сообщения после подтверждения
      await ctx.deleteMessage();
    } catch (err) {
      console.error("Ошибка при удалении сообщения:", err);
    }
    await ctx.reply(messages.confirmGoodDeed(deedId));
  } catch (err) {
    console.error(errors.confirmGoodDeedError, err);
    await ctx.reply(errors.confirmGoodDeedError);
  }
});

// Обработка нажатия кнопки "Отклонить"
bot.action(/reject_(\d+)/, async (ctx) => {
  const deedId = ctx.match[1];
  try {
    await dbClient.query(
      `UPDATE public.good_deeds SET status = '${status.rejected}' WHERE id = $1`,
      [deedId]
    );
    try {
      // Удаление сообщения после подтверждения
      await ctx.deleteMessage();
    } catch (err) {
      console.error("Ошибка при удалении сообщения:", err);
    }
    await ctx.reply(messages.rejectGoodDeed(deedId));
  } catch (err) {
    console.error(errors.rejectGoodDeedError, err);
    await ctx.reply(errors.rejectGoodDeedError);
  }
});

// Обработка кнопки "Общая статистика"
bot.hears(buttons.statistics, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = null;
  const isAdminUser = await isAdmin(ctx);
  if (!isAdminUser) {
    await ctx.reply(messages.insufficientPermissions);
    return;
  }

  try {
    // Выполняем запрос для получения суммарного опыта и общего балла
    const result = await dbClient.query(`
      SELECT 
        SUM(volunteer_experience::integer) AS total_experience,
        SUM(coins) AS total_coins
      FROM 
        public.users;
    `);

    const totalExperience = result.rows[0].total_experience || 0;
    const totalCoins = result.rows[0].total_coins || 0;

    // Формируем сообщение с общей статистикой
    const statsMessage = `
      📊 *Общая статистика* 📊
      - Суммарный опыт: ${totalExperience} месяцев
      - Общий балл: ${totalCoins} монет
    `;

    // Отправляем сообщение с результатами
    await ctx.replyWithMarkdown(statsMessage);

    // Запрос к базе данных для получения данных пользователей, отсортированных по coins по убыванию
    const resultForExcel = await dbClient.query(`
  SELECT telegram_login, full_name, coins, volunteer_experience
  FROM public.users
  ORDER BY coins DESC;
`);

    // Создание нового Excel-файла
    const workbook = new ExcelJS.Workbook();
    const worksheet1 = workbook.addWorksheet("Статистика пользователей");

    // Добавление заголовков для первого листа
    worksheet1.columns = [
      { header: "Логин", key: "telegram_login", width: 20 },
      { header: "ФИО", key: "full_name", width: 30 },
      { header: "Баллы", key: "coins", width: 10 },
      { header: "Опыт", key: "volunteer_experience", width: 15 },
    ];

    // Заполнение данными
    resultForExcel.rows.forEach((user) => {
      worksheet1.addRow({
        telegram_login: user.telegram_login,
        full_name: user.full_name,
        coins: user.coins,
        volunteer_experience: user.volunteer_experience,
      });
    });

    // Запрос к базе данных для получения данных из used_codes
    const resultForCodes = await dbClient.query(`
  SELECT telegram_login, code_word, used_at
  FROM public.used_codes
  ORDER BY used_at DESC;
`);

    // Создание второго листа для данных used_codes
    const worksheet2 = workbook.addWorksheet("Использованные коды");

    // Добавление заголовков для второго листа
    worksheet2.columns = [
      { header: "Логин", key: "telegram_login", width: 20 },
      { header: "Ключевое слово", key: "code_word", width: 30 },
      { header: "Время использования", key: "used_at", width: 20 },
    ];

    // Заполнение данными с форматированием времени
    resultForCodes.rows.forEach((code) => {
      worksheet2.addRow({
        telegram_login: code.telegram_login,
        code_word: code.code_word,
        used_at: new Date(code.used_at).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    });

    // Сохранение файла в текущей директории проекта
    const filePath = "users_statistics.xlsx";
    await workbook.xlsx.writeFile(filePath);

    // Отправка файла пользователю
    await ctx.replyWithDocument({
      source: filePath,
      filename: "users_statistics.xlsx",
    });
  } catch (err) {
    console.error(errors.statisticsError, err);
    await ctx.reply(errors.statisticsError);
  }
});

// Обработка команды "За посещение мероприятия"
bot.hears(buttons.attendEvent, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = "attendEvent";
  await ctx.reply(messages.enterCodeWord);
});

// Обработка команды "Викторина про добро"
bot.hears(buttons.quiz, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  session.currentAction = "quiz";
  try {
    const finished = await startQuiz(ctx);
    if (finished?.byAlready) {
      return ctx.reply(messages.quizRetry);
    }
    if (finished?.byNonQuiz) {
      return ctx.reply(messages.noQuestions);
    }
  } catch (err) {
    ctx.reply(errors.startQuizError);
  } finally {
    session.currentAction = null;
  }
});

// Обработчик ответа пользователя
bot.on("callback_query", async (ctx) => {
  if (!ctx.session) {
    return;
  }
  const userAnswer = ctx.callbackQuery.data;
  const quiz = ctx.session.quiz;
  if (!quiz) {
    return;
  }
  const currentQuestion = quiz.questions[quiz.currentQuestionIndex];
  // Проверка правильности ответа
  if (userAnswer === currentQuestion.correct_answer) {
    quiz.correctAnswersCount++;
  }

  // Переход к следующему вопросу
  quiz.currentQuestionIndex++;
  await ctx.reply(`${messages.quezVariant} ${userAnswer}`);
  try {
    // Удаление сообщения после подтверждения
    await ctx.deleteMessage();
  } catch (err) {
    console.error("Ошибка при удалении сообщения:", err);
  }
  await sendNextQuestion(ctx);
});

// Обработка команды "За пост в сети"
bot.hears(buttons.goodDeedEvent, async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  try {
    const currentDate = getDateString();
    const telegramLogin = ctx.from.username;
    const resultCount = await dbClient.query(
      `SELECT COUNT(*) FROM good_deeds 
        WHERE LOWER(telegram_login) = LOWER($1) 
        AND DATE(created_at) = $2`,
      [telegramLogin, currentDate]
    );

    const deedCount = +resultCount.rows[0].count;
    if (deedCount >= 10) {
      session.currentAction = null;
      return ctx.reply(messages.maxGoodDeeds);
    }
    session.currentAction = "uploadGoodDeed";
    await ctx.reply(messages.uploadGoodDeedPhoto);
  } catch (err) {
    await ctx.reply(errors.startUploadError);
    session.currentAction = null;
  }
});

// Обработка кода слова для получения доброкоинов
bot.on("message", async (ctx) => {
  const session = getSession(ctx.chat.id); // Получаем или создаем сессию пользователя
  const telegramLogin = ctx.from.username;
  if (session.currentAction === "attendEvent") {
    if (!ctx.message.text) {
      await ctx.reply(errors.invalidCodeWord);
      return;
    }
    const codeWord = ctx.message.text.trim();

    try {
      const codeResult = await dbClient.query(
        `SELECT * FROM public.codes WHERE LOWER(code_word) = LOWER($1)`,
        [codeWord]
      );

      // Проверка, существует ли код
      if (codeResult.rows.length > 0) {
        const validCode = codeResult.rows[0].code_word;
        // Проверяем, использовал ли пользователь код ранее
        const usedCodeResult = await dbClient.query(
          `SELECT * FROM public.used_codes 
            WHERE LOWER(telegram_login) = LOWER($1) 
            AND code_word = $2
            LIMIT 1`,
          [telegramLogin, validCode]
        );

        if (usedCodeResult.rows.length === 0) {
          // Код существует, но еще не использован этим пользователем
          const total = 50;
          await dbClient.query(
            `UPDATE public.users SET coins = coins + $1 WHERE LOWER(telegram_login) = LOWER($2)`,
            [total, telegramLogin]
          );

          const totalCoins = await getUserCoins(telegramLogin);

          // Сохраняем информацию об использовании кода
          await dbClient.query(
            `INSERT INTO public.used_codes (telegram_login, code_word) VALUES (LOWER($1), $2)`,
            [telegramLogin, validCode]
          );

          session.currentAction = null;
          const photoPath = path.join(
            __dirname,
            "assets/images",
            `coin_${total}.png`
          );
          await ctx.replyWithPhoto(
            {
              source: photoPath,
            },
            { caption: messages.totalCoins(totalCoins) }
          );
        } else {
          // Код уже использован этим пользователем
          await ctx.reply(errors.codeAlreadyUsed);
        }
      } else {
        // Код не найден
        await ctx.reply(errors.invalidCodeWord);
      }
    } catch (err) {
      console.error(errors.userCheckError, err);
      await ctx.reply(errors.userCheckError);
    }
    return;
  }

  if (session.currentAction === "uploadGoodDeed") {
    const photo = ctx.message.photo;

    if (!photo || photo.length === 0) {
      // Если фото отсутствует, отправляем сообщение с просьбой отправить фото
      await ctx.reply(errors.photoRequired);
      return;
    }

    const photoId = photo[photo.length - 1].file_id;
    const caption = ctx.message.caption || messages.emptyDeedDescription;

    try {
      const user = await dbClient.query(
        `SELECT telegram_login FROM public.users WHERE LOWER(telegram_login) = LOWER($1) LIMIT 1`,
        [telegramLogin]
      );

      if (!user.rows.length) {
        throw new Error("Пользователь не найден");
      }

      const normalizedLogin = user.rows[0].telegram_login;

      await dbClient.query(
        `INSERT INTO public.good_deeds (telegram_login, photo_id, description, status) VALUES (LOWER($1), $2, $3, '${status.pending}')`,
        [normalizedLogin, photoId, caption]
      );

      session.currentAction = null;
      await ctx.reply(messages.goodDeedRegistered);
    } catch (err) {
      console.error(errors.photoUploadError, err);
      await ctx.reply(errors.photoUploadError);
    }
    return;
  }

  if (session.currentAction === "registration") {
    try {
      const { fullName, isAdminUser } = await addUser(ctx);
      if (fullName) {
        finalMenu = isAdminUser ? adminMenu : userMenu;
        session.currentAction = null;
        await ctx.reply(messages.registered, finalMenu);
      }
    } catch (err) {}
    return;
  }
});

// Функция для инициализации сессии пользователя
function getSession(chatId) {
  if (!userSessions.has(chatId)) {
    userSessions.set(chatId, { currentAction: null });
  }
  return userSessions.get(chatId);
}

bot.launch().then(() => {
  console.log(messages.launch);
});
