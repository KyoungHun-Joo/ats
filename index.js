process.env.TZ = "Asia/Seoul";

const rsiCompare1 = require("./strategy/rsiCompare1");
const upbitCompare = require("./strategy/upbitCompare");
const CONFIG = require("./config")();

const mysql_dbc = require("./db_con")();
const Bithumb = require("./bithumb");
const UpbitAPI = require("./upbit");

const bithumb = new Bithumb();
const upbit = new UpbitAPI();
const RSI = require("technicalindicators").RSI;
const gap = 0;
const lowPoint = CONFIG.LOW_POINT + gap;
const highPoint = CONFIG.HIGH_POINT - gap;

const minLambda = true;
const priceTable = "price2";
const cron = require("node-cron");
const type = "upbit";
var connection;

function numberPad(n) {
  n = n + "";
  return n.length >= 2 ? n : "0" + n;
}

function getCmcKey() {
  var year = new Date().getFullYear();
  var month = numberPad(new Date().getMonth() + 1);
  var day = numberPad(new Date().getDate());
  var hour = numberPad(new Date().getHours());
  var min = numberPad(new Date().getMinutes());

  var period = 1;

  if (min < 15) {
  } else if (min < 30) {
    period = 2;
  } else if (min < 45) {
    period = 3;
  } else if (min < 60) {
    period = 4;
  }
  if (minLambda) {
    var cmc_key = year + month + day + hour + min;
  } else {
    var cmc_key = year + month + day + hour + period;
  }

  return cmc_key;
}

async function buy(
  type,
  amount,
  coinPrice,
  test = false,
  slug = "ETH",
  platform = "bithumb"
) {
  if (platform == "upbit") {
    coinPrice = await upbit.converPrice(coinPrice);
    var lockAmount = Math.floor((amount / coinPrice) * 10000) / 10000;
  } else {
    var lockAmount = Math.floor((amount / coinPrice) * 1000) / 1000;
  }
  amount -= lockAmount * coinPrice;

  if (amount < 0) amount = 0;
  if (test) {
    await connection.execute(
      "UPDATE variable SET status=4, slug='" +
        slug +
        "' WHERE `key` = '" +
        type +
        "'"
    );

    await connection.query(
      "INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id,slug,status,lastPrice) VALUES ('" +
        type +
        "', '" +
        amount +
        "', '" +
        lockAmount +
        "', 4,'" +
        coinPrice +
        "','','" +
        slug +
        "',1)"
    );
  } else {
    if (platform == "upbit") {
      var order_id = await upbit.trade("bid", slug, coinPrice, lockAmount);
      console.log("order id", order_id);
    } else {
      lockAmount *= 0.99;
      lockAmount = Math.floor(lockAmount * 1000) / 1000;

      var order_id = await bithumb.call("buy", coinPrice, lockAmount, slug);
    }

    if (order_id) {
      await connection.execute(
        "UPDATE variable SET status=2, slug='" +
          slug +
          "' WHERE `key` = '" +
          type +
          "'"
      );

      await connection.query(
        "INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice,order_id,slug) VALUES ('" +
          type +
          "', '" +
          amount +
          "', 0, 1,'" +
          coinPrice +
          "','" +
          order_id +
          "','" +
          slug +
          "')"
      );
    }
  }
  return;
}

async function sell(
  type,
  lockAmount,
  coinPrice,
  test = false,
  slug = "ETH",
  platform
) {
  console.log("sell in", type, lockAmount, coinPrice);
  var value = Math.floor(lockAmount * coinPrice);

  const [data, fields] = await connection.execute(
    "SELECT price,fee,buysellPrice,slug FROM trade_log where `type` = '" +
      type +
      "' AND `buysell` = 1 ORDER BY createdAt DESC LIMIT 0,1"
  );
  var buysellPrice = data[0].buysellPrice;
  var left = data[0].price - data[0].fee - value;
  console.log("sell in 2 ", slug, data[0].slug);
  if (slug != data[0].slug) return;

  if (
    platform != "upbit" &&
    buysellPrice > 0 &&
    buysellPrice * 1.0225 > coinPrice
  ) {
    console.log("buysellPrice not valid", buysellPrice, coinPrice);
    return;
  }
  if (test) {
    await connection.execute(
      "UPDATE variable SET value = value + " +
        value +
        ",status=3, lockAmount = 0 WHERE `key` = '" +
        type +
        "'"
    );
    await connection.query(
      "INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id,slug,status) VALUES ('" +
        type +
        "', '" +
        value +
        "', '" +
        lockAmount +
        "',2,'" +
        coinPrice +
        "','','" +
        slug +
        "',1)"
    );
  } else {
    if (platform == "upbit") {
      coinPrice = await upbit.converPrice(coinPrice);
      var order_id = await upbit.trade("ask", slug, coinPrice, lockAmount);
    } else {
      var order_id = await bithumb.call("sell", coinPrice, lockAmount, slug);
    }

    if (order_id) {
      await connection.execute(
        "UPDATE variable SET status=1, lockAmount = 0 WHERE `key` = '" +
          type +
          "'"
      );

      await connection.query(
        "INSERT INTO trade_log (type, price, lockAmount, buysell,buysellPrice, order_id,slug) VALUES ('" +
          type +
          "', '" +
          value +
          "', '" +
          lockAmount +
          "',2,'" +
          coinPrice +
          "','" +
          order_id +
          "','" +
          slug +
          "')"
      );
    }
  }

  return;
}

async function compareRSI1(connection, rsiArr, lastRSI, coinPrice, slug) {
  if (minLambda) {
    var type = "money4";
  } else {
    var type = "money1";
  }

  const [data, fields] = await connection.execute(
    "SELECT value,lockAmount,status FROM variable where `key` = '" + type + "'"
  );

  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;

  //매수전
  if (status == 3) {
    if (await rsiCompare1(1, lastRSI))
      await buy(type, money, coinPrice, false, slug);
    //매도전
  } else if (status == 4) {
    if (await rsiCompare1(2, lastRSI))
      await sell(type, lockAmount, coinPrice, false, slug);
  }
}

//급등락 대비
async function compareRSI2(connection, rsiArr, lastRSI, coinPrice, slug) {
  var type = "money5";

  const [data, fields] = await connection.execute(
    "SELECT value,lockAmount,status,slug FROM variable where `key` = '" +
      type +
      "'"
  );
  var money = data[0].value;
  var lockAmount = data[0].lockAmount;
  var status = data[0].status;
  var comSlug = data[0].slug;
  if (comSlug != slug && status != 3) return;
  const compareRSI = rsiArr.slice(-20);

  var turnToHigh = false;
  var turnToLow = false;
  var beforeCompare2;
  var beforeCompare;
  var compare;

  for (let i = 0; i < compareRSI.length; i++) {
    if (i > 2) {
      beforeCompare2 = compareRSI[i - 2];
      beforeCompare = compareRSI[i - 1];
      compare = compareRSI[i];

      if (compare > lowPoint) turnToHigh = false;

      if (
        beforeCompare2 < lowPoint &&
        beforeCompare < lowPoint &&
        lastRSI > beforeCompare
      )
        turnToHigh = true;

      if (compare < highPoint) turnToLow = false;

      if (
        beforeCompare2 > highPoint &&
        beforeCompare > highPoint &&
        lastRSI < beforeCompare
      )
        turnToLow = true;
    }
  }
  console.log(
    "compare2",
    slug,
    beforeCompare2,
    beforeCompare,
    compare,
    lastRSI
  );
  //console.log('compare2',beforeCompare2,beforeCompare,lastRSI);
  //rsi 20 아래로 떨어지면 그냥 구매
  if (lastRSI < 17) {
    turnToHigh = true;
  }

  // if(lastRSI>85){
  //   turnToLow = true;
  // }

  //매수전
  if (status == 3 && turnToHigh) {
    await buy(type, money, coinPrice, false, slug);
    //매도전
  } else if (status == 4 && turnToLow) {
    await sell(type, lockAmount, coinPrice, false, slug);
  }
}

//3시간 RSI 평균값으로 매수,매도 시점 계산
async function compareRSI3(connection, rsiArr, lastRSI, coinPrice, slug) {
  const [data, fields] = await connection.execute(
    "SELECT value,lockAmount,status,slug FROM variable where `key` = 'money3'"
  );
  var money = data[0].value;
  var status = data[0].status;

  const compareRSI = rsiArr.slice(-12);
  var totalRSI = 0;
  var totalCnt = 0;
  if (slug != data[0].slug) return;

  for (let i = 0; i < compareRSI.length; i++) {
    if (compareRSI[i] > 0) {
      totalRSI += compareRSI[i];
      totalCnt++;
    }
  }

  const avgRSI = totalRSI / totalCnt;
  const avgGap = 10;

  //매수전
  if (status == 3 && lastRSI <= avgRSI - avgGap) {
    await buy("money3", money, coinPrice, true, slug);
    //매도전
  } else if (status == 4 && lastRSI >= avgRSI + avgGap) {
    await sell("money3", money, coinPrice, true, slug);
  }
}

//변동성 돌파 전략
async function compareRSI4(connection, priceArr, coinPrice) {
  var maxPrice = priceArr[0];
  var minPrice = priceArr[0];
  var term = 60; //1 getHours
  const compareArr = priceArr.slice(-term);

  for (let i = 0; i < priceArr.length; i++) {
    const currentPrice = priceArr[i];
    if (maxPrice < currentPrice) maxPrice = currentPrice;
    if (minPrice > currentPrice) minPrice = currentPrice;
  }
}

//오래 머무른 거래 만료
async function expire() {}

async function checkOrder() {
  const [data, fields] = await connection.execute(
    "SELECT * FROM trade_log WHERE status=0 AND order_id != '' "
  );

  if (!data) return;

  for (let i = 0; i < data.length; i++) {
    if (!data[i].order_id) return;
    try {
      var trade_amount = 0;
      var trade_fee = 0;
      var trade_units = 0;
      if (data[i].type == "upbitMoney") {
        var result = await upbit.orderInfo(data[i].order_id);
        var nowPrice = await upbit.coinPrice(data[i].slug);
        console.log(
          "now --",
          data[i].slug,
          nowPrice,
          " -> ",
          data[i].buysellPrice
        );

        if (result.state == "done") {
          const [leftValue, fileds] = await connection.execute(
            "SELECT value FROM variable WHERE `key` = '" + data[i].type + "' "
          );

          var trade_fee = 0;
          var trade_units = 0;

          for (let j = 0; j < result.trades.length; j++) {
            trade_amount += Number(result.trades[j].funds);
            trade_units += Number(result.trades[j].volume);
          }
          trade_fee = result.paid_fee;

          await connection.execute(
            "UPDATE trade_log SET statusStr = '" +
              result.state +
              "', status =1 ,price='" +
              trade_amount +
              "',lockAmount='" +
              trade_units +
              "',fee='" +
              trade_fee +
              "' WHERE `id` = '" +
              data[i].id +
              "'"
          );
          //구매완료
          if (result.side == "bid") {
            console.log("bid completed", trade_amount, leftValue, trade_fee);
            var bidVal = Number(leftValue[0].value) - trade_amount;
            await connection.execute(
              "UPDATE variable SET status = 4,value='" +
                bidVal +
                "',lockAmount = '" +
                trade_units +
                "',lastPrice = '" +
                result.price +
                "' WHERE `key` = '" +
                data[i].type +
                "'"
            );
            await connection.execute(
              "UPDATE upbit_coin SET weight = weight+2 WHERE `market` = '" +
                data[i].slug +
                "'"
            );
            await connection.execute(
              "UPDATE upbit_coin SET weight = if(weight>0,weight -0.5,weight) WHERE `market` != '" +
                data[i].slug +
                "'"
            );
          } else if (result.side == "ask") {
            console.log(
              "ask completed",
              trade_amount,
              leftValue[0].value,
              trade_fee
            );
            //다음 주문시 trade fee 미리 차감
            trade_amount = trade_amount - trade_fee - trade_fee;
            trade_amount = Math.floor(trade_amount);
            await connection.execute(
              "UPDATE variable SET status = 3,value = value + '" +
                trade_amount +
                "' WHERE `key` = '" +
                data[i].type +
                "'"
            );
          }
        } else if (result.state == "cancel") {
          const [status, fileds1] = await connection.execute(
            "SELECT status FROM variable WHERE `key` = '" + data[i].type + "' "
          );
          const [trade, fileds2] = await connection.execute(
            "SELECT type,slug,lockAmount,price FROM trade_log WHERE buysell=1 AND `type` = '" +
              data[i].type +
              "' ORDER BY id desc limit 1"
          );
          if (status[0].status == 1) {
            var coinPrice = await upbit.coinPrice(trade[0].slug);

            await sell(
              trade[0].type,
              trade[0].lockAmount,
              coinPrice * 1.01,
              false,
              trade[0].slug,
              "upbit"
            );
            await connection.execute(
              "UPDATE variable SET status = 1,value = value+" +
                trade[0].price +
                " WHERE `key` = '" +
                data[i].type +
                "'"
            );
            await connection.execute(
              "UPDATE trade_log SET statusStr = '" +
                result.state +
                "', status =1 WHERE type="
            );
          } else {
            await connection.execute(
              "UPDATE variable SET status = 3 WHERE `key` = '" +
                data[i].type +
                "'"
            );
          }
          await connection.execute(
            "UPDATE trade_log SET statusStr = '" +
              result.state +
              "', status =1 WHERE `id` = '" +
              data[i].id +
              "'"
          );
        }
      } else {
        var result = await bithumb.xcoinApiCall("/info/order_detail", {
          order_currency: data[i].slug,
          order_id: data[i].order_id,
        });

        result = JSON.parse(result);

        if (result.data.order_status == "Completed") {
          const [leftValue, fileds] = await connection.execute(
            "SELECT value FROM variable WHERE `key` = '" + data[i].type + "' "
          );

          for (let j = 0; j < result.data.contract.length; j++) {
            trade_amount += Number(result.data.contract[j].total);
            trade_fee += Number(result.data.contract[j].fee);
            trade_units += Number(result.data.contract[j].units);
          }

          await connection.execute(
            "UPDATE trade_log SET statusStr = '" +
              result.data.order_status +
              "', status =1 ,price='" +
              trade_amount +
              "',lockAmount='" +
              trade_units +
              "',fee='" +
              trade_fee +
              "' WHERE `id` = '" +
              data[i].id +
              "'"
          );
          //구매완료
          if (result.data.type == "bid") {
            console.log("bid completed", trade_amount, leftValue, trade_fee);
            var bidVal = Number(leftValue[0].value) - trade_amount + trade_fee;
            await connection.execute(
              "UPDATE variable SET status = 4,value='" +
                bidVal +
                "',lockAmount = '" +
                trade_units +
                "' WHERE `key` = '" +
                data[i].type +
                "'"
            );
          } else if (result.data.type == "ask") {
            console.log("ask completed", trade_amount, leftValue, trade_fee);

            trade_amount = trade_amount - trade_fee;
            await connection.execute(
              "UPDATE variable SET status = 3,value = '" +
                trade_amount +
                "' WHERE `key` = '" +
                data[i].type +
                "'"
            );
          }
          return true;
        } else {
          await connection.execute(
            "UPDATE trade_log SET statusStr = '" +
              result.data.order_status +
              "' WHERE `id` = '" +
              data[i].id +
              "'"
          );

          return false;
        }
      }
    } catch (e) {
      await connection.execute(
        "UPDATE trade_log SET statusStr = '" +
          e.message +
          "' WHERE `id` = '" +
          data[i].id +
          "'"
      );
    }
  }
}

async function bitumbTrade() {
  var cmc_key = getCmcKey();

  var response = await bithumb.orderBook();
  var inputRSI = {
    values: [],
    period: 14,
  };
  var inputRSI15 = {
    values: [],
    period: 14,
  };
  if (response.status == "0000") {
    var coinDatas = response.data;
    const coinArr = ["ONG", "ORC", "ADA", "EOS", "ETH", "BTC"];
    for (let i = 0; i < Object.keys(coinDatas).length; i++) {
      if (coinArr.includes(Object.keys(coinDatas)[i])) {
        inputRSI.values = [];
        inputRSI15.values = [];

        const coinKey = Object.keys(coinDatas)[i];
        const coinPrice = coinDatas[coinKey].bids[0].price;

        await connection.query(
          "INSERT INTO " +
            priceTable +
            " (date_key, slug, price) VALUES ('" +
            cmc_key +
            "',  '" +
            coinKey +
            "', '" +
            coinPrice +
            "')"
        );

        const [priceData, fields] = await connection.execute(
          "SELECT * FROM " +
            priceTable +
            " WHERE slug='" +
            coinKey +
            "' ORDER BY createdAt DESC LIMIT 1000"
        );

        const compareMin = new Date().getMinutes() % 15;

        for (let i = priceData.length - 1; i >= 0; i--) {
          await inputRSI.values.push(priceData[i].price);
          if (
            Number(priceData[i].date_key.toString().slice(-2)) % 15 ==
            compareMin
          )
            await inputRSI15.values.push(priceData[i].price);
        }

        const rsiRes = await RSI.calculate(inputRSI);
        const rsiRes15 = await RSI.calculate(inputRSI15);

        const lastRSI = rsiRes[rsiRes.length - 1];
        const lastRSI15 =
          rsiRes15[rsiRes15.length - 1] >= 0
            ? rsiRes15[rsiRes15.length - 1]
            : 0;

        if (lastRSI > 0) {
          await connection.query(
            "UPDATE " +
              priceTable +
              " SET rsi = " +
              lastRSI +
              ", rsi15 = " +
              lastRSI15 +
              " WHERE date_key = '" +
              cmc_key +
              "' AND slug='" +
              coinKey +
              "'"
          );
          //await compareRSI1(connection, rsiRes15,lastRSI15,coinPrice,coinKey);
          await compareRSI2(
            connection,
            rsiRes15,
            lastRSI15,
            coinPrice,
            coinKey
          );
          //await compareRSI3(connection, rsiRes15,lastRSI15,coinPrice,coinKey);
        } else {
          await connection.query(
            "INSERT INTO log (text) VALUES ('no rsi" + lastRSI + "')"
          );
        }
      }
    }
  }
}

async function upbitTrade(connection) {
  const [upData, fields] = await connection.execute(
    "SELECT * FROM variable where `key` LIKE 'upbit%'"
  );
  var upbitData;
  var inputRSI15 = {
    values: [],
    period: 14,
  };
  var getCoin = false;
  for (let x = 0; x < upData.length; x++) {
    if (upData[x].status == 3) getCoin = true;
  }
  if (getCoin) upbitData = await upbit.useCoinInfo(connection, 3, 100);

  for (let x = 0; x < upData.length; x++) {
    const valueStatus = upData[x].status;
    const lastPrice = upData[x].lastPrice;
    const slug = upData[x].slug;
    const value = upData[x].value;
    const lockAmount = upData[x].lockAmount;
    const type = upData[x].key;

    if (valueStatus == 3) {
      var buyFlag = false;
      for (let i = 0; i < upbitData.length; i++) {
        inputRSI15.values = [];
        const market = upbitData[i].market;
        const priceData = upbitData[i].data;
        const weight = upbitData[i].weight;

        for (let j = priceData.length - 1; j >= 0; j--) {
          await inputRSI15.values.push(priceData[j].trade_price);
        }
        const rsiRes15 = await RSI.calculate(inputRSI15);
        const lastRSI15 =
          rsiRes15[rsiRes15.length - 1] >= 0
            ? rsiRes15[rsiRes15.length - 1]
            : 0;
        console.log("market", market, lastRSI15, priceData[0].trade_price);

        if ((await upbitCompare(1, lastRSI15, 0, 0, weight)) && !buyFlag) {
          buyFlag = true;
          await buy(
            type,
            value,
            priceData[0].trade_price,
            false,
            market,
            "upbit"
          );
        }
      }
    } else if (valueStatus == 4) {
      var coinPrice = await upbit.coinPrice(slug);
      console.log("coinPrice", lockAmount, lastPrice, slug, coinPrice);
      //if(await upbitCompare(2,0,lastPrice,coinPrice)) await sell(type,lockAmount,coinPrice,false,slug,"upbit")
      await sell(type, lockAmount, lastPrice * 1.011, false, slug, "upbit");
    }
  }
}

async function call(event, context, callback) {
  //mailService('test')

  const cmc_key = getCmcKey();
  connection = await mysql_dbc.init();

  try {
    await checkOrder();
    if (type == "upbit") {
      await upbitTrade(connection);
    } else {
      await bitumbTrade();
    }

    await connection.release();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: cmc_key,
    };
  } catch (e) {
    console.log(e);
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: e.message,
    };
  }
}

async function recall() {
  connection = await mysql_dbc.init();
  var inputRSI = {
    values: [],
    period: 14,
  };

  const [priceData, fields] = await connection.execute(
    "SELECT * FROM price ORDER BY date_key DESC"
  );

  for (let i = priceData.length - 1; i >= 0; i--) {
    inputRSI.values.push(priceData[i].price);

    const rsiRes = await RSI.calculate(inputRSI);
    var lastRSI = rsiRes[rsiRes.length - 1];
    lastRSI = lastRSI ? lastRSI : 0;
    await connection.query(
      "UPDATE price SET rsi = " +
        lastRSI +
        " WHERE date_key = '" +
        priceData[i].date_key +
        "'"
    );
  }
}

if (type == "upbit") {
  // second minute hour day-of-month month day-of-week
  cron.schedule("* * * * *", function () {
    call();
  });
} else {
  exports.handler = call;
}
