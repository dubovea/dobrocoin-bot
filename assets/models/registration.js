const dbClient = require("./dbConnection");
const { messages, errors } = require("./constants");

let IS_ADMIN = false;
async function checkRegistration(ctx) {
  const telegramLogin = ctx.from.username;
  try {
    const userResult = await dbClient.query(
      `SELECT * FROM public.users WHERE LOWER(telegram_login) = LOWER($1)`,
      [telegramLogin]
    );
    const isAdminUser = await isAdmin(ctx);
    const isRegistered = !!userResult.rows.length;
    IS_ADMIN = isAdminUser;
    return { isRegistered, isAdminUser };
  } catch (err) {
    console.error(errors.registrationError, err);
    ctx.reply(errors.registrationError);
  }
}

async function addUser(ctx) {
  const message = ctx.message.text;
  const regex = /^[А-Яа-яёЁ]+ [А-Яа-яёЁ]+ \d{1,3} (месяц|месяцев|месяца)$/;

  if (!regex.test(message)) {
    await ctx.reply(messages.invalidUserInput);
    return;
  }

  // Проверка на наличие логина
  const telegramLogin = ctx.from.username;
  if (!telegramLogin) {
    await ctx.reply(errors.missingUsername);
    return;
  }

  const splittedInfo = message.split(" ");
  const fullName = `${splittedInfo[0]} ${splittedInfo[1]}`;
  const experience = splittedInfo[2];

  try {
    await dbClient.query(
      `INSERT INTO public.users (telegram_login, full_name, volunteer_experience, coins) VALUES ($1, $2, $3, 0)`,
      [telegramLogin, fullName, experience]
    );
    return { fullName, isAdminUser: IS_ADMIN };
  } catch (err) {
    console.error(errors.registrationError, err);
    ctx.reply(errors.registrationError);
  }
}

async function isAdmin(ctx) {
  const telegramLogin = ctx.from.username;
  // Проверка прав администратора
  const result = await dbClient.query(
    `SELECT * FROM public.admins WHERE LOWER(telegram_login) = LOWER($1)`,
    [telegramLogin]
  );
  return result.rows.length > 0;
}

module.exports = {
  checkRegistration,
  addUser,
  isAdmin,
};
