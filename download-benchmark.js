const { performance } = require('node:perf_hooks');

// Количество последовательных запросов к одному и тому же адресу.
const REQUEST_COUNT = 10;

// В одном MiB содержится 1024 * 1024 байт.
const BYTES_PER_MIB = 1024 * 1024;

// Полностью читает тело HTTP-ответа и возвращает число полученных байт.
// Данные обрабатываются по частям и не сохраняются в файл.
async function consumeBody(body) {
  // У ответа без тела объём данных равен нулю.
  if (!body) {
    return 0;
  }

  // Поток позволяет считать ответ частями, не загружая всё изображение
  // в память одновременно.
  const reader = body.getReader();
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // Поток закончился: возвращаем суммарный размер всех его частей.
      return bytes;
    }

    // Учитываем размер очередной части ответа в байтах.
    bytes += value.byteLength;
  }
}

async function main() {
  // URL передаётся первым аргументом после имени скрипта.
  const address = process.argv[2];
  if (!address) {
    throw new Error('Укажите URL: node download-benchmark.js <URL>');
  }

  // Проверяем, что аргумент является корректным URL.
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new Error(`Некорректный URL: ${address}`);
  }

  // Скрипт выполняет только обычные HTTP- и HTTPS-запросы.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Поддерживаются только URL с протоколами HTTP и HTTPS.');
  }

  // Переменные для итогового объёма и суммы длительностей запросов.
  let totalBytes = 0;
  let totalRequestTimeMs = 0;
  // Сохраняем статусы, чтобы в конце сообщить о неуспешных ответах.
  const statuses = [];

  // Общий таймер охватывает все запросы, включая ожидание ответов.
  const overallStart = performance.now();

  // Запросы выполняются последовательно: каждый следующий начинается
  // только после получения полного тела предыдущего ответа.
  for (let requestNumber = 1; requestNumber <= REQUEST_COUNT; requestNumber += 1) {
    const requestStart = performance.now();
    // fetch отправляет GET-запрос на указанный URL.
    const response = await fetch(url);
    // Читаем ответ до конца и узнаём количество полученных байт.
    const bytes = await consumeBody(response.body);
    // Время запроса включает ожидание ответа и чтение всего его тела.
    const requestTimeMs = performance.now() - requestStart;

    // Добавляем результаты текущего запроса к общим показателям.
    totalBytes += bytes;
    totalRequestTimeMs += requestTimeMs;
    statuses.push(response.status);

    // Показываем статус, объём ответа и длительность этого запроса.
    console.log(
      `Запрос ${requestNumber}/${REQUEST_COUNT}: ${response.status}, ` +
      `${(bytes / BYTES_PER_MIB).toFixed(2)} MiB, ${requestTimeMs.toFixed(2)} мс`,
    );
  }

  // Считаем общее прошедшее время, общий объём в MiB и среднюю скорость.
  // Скорость — суммарный объём, разделённый на общее время десяти запросов.
  const totalTimeSeconds = (performance.now() - overallStart) / 1000;
  const totalMib = totalBytes / BYTES_PER_MIB;
  const speedMibPerSecond = totalTimeSeconds > 0 ? totalMib / totalTimeSeconds : 0;

  // Выводим сводные результаты измерения.
  console.log('\nИтоги:');
  console.log(`Запросов: ${REQUEST_COUNT}`);
  console.log(`Среднее время запроса: ${(totalRequestTimeMs / REQUEST_COUNT).toFixed(2)} мс`);
  console.log(`Всего скачано: ${totalMib.toFixed(2)} MiB`);
  console.log(`Общее время: ${totalTimeSeconds.toFixed(2)} с`);
  console.log(`Средняя скорость загрузки: ${speedMibPerSecond.toFixed(2)} MiB/s`);

  // HTTP-статус вне диапазона 200–299 означает, что запрос не был успешным.
  const nonSuccessfulStatuses = statuses.filter((status) => status < 200 || status >= 300);
  if (nonSuccessfulStatuses.length > 0) {
    console.error(`Некоторые ответы имели неуспешный HTTP-статус: ${nonSuccessfulStatuses.join(', ')}`);
    process.exitCode = 1;
  }
}

// Обрабатываем ошибки URL, сети и чтения ответа: выводим причину
// и завершаем процесс с кодом ошибки.
main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
