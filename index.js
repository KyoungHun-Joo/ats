const rsiCompare1 = require("./strategy/rsiCompare1");
const upbitCompare = require("./strategy/upbitCompare");
const CONFIG = require("./config")();

const mysql_dbc = require("./db_con")();
const Bithumb = require("./lib/bithumb");
const UpbitAPI = require("./lib/upbit");

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
  platform = "upbit"
) {
  coinPrice = await upbit.converPrice(coinPrice);
  var lockAmount = Math.floor((amount / coinPrice) * 10000) / 10000;

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
    var order_id = await upbit.trade("bid", slug, coinPrice, lockAmount);
    console.log("order id", order_id);
 
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

  const [data, fields] = await connection.execute(` SELECT * FROM trade_log where \`type\` = '${type}' `+
                                                  ` AND \`buysell\` = 1 ORDER BY createdAt DESC LIMIT 0,1`);
  var buysellPrice = data[0].buysellPrice;
  var left = data[0].price - data[0].fee - value;
  console.log("sell in 2 ", slug, data[0].slug);
  if (slug != data[0].slug) return;

  if ( platform != "upbit" && buysellPrice > 0 && buysellPrice * 1.0135 > coinPrice ) {
    console.log("buysellPrice not valid", buysellPrice, coinPrice);
    return;
  }

  if ( platform == "upbit" ){
    coinPrice = await upbit.converPrice(coinPrice);
    var order_id = await upbit.trade("ask", slug, coinPrice, lockAmount);
  } else {
    var order_id = await bithumb.call("sell", coinPrice, lockAmount, slug);
  }

  if (order_id) {
    await connection.execute(` UPDATE variable SET status=1, lockAmount = 0 WHERE \`key\` = '${type}'`);

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

  return;
}


//급등락 대비
async function compareRSI2(connection, rsiArr, lastRSI, coinPrice, slug) {
  var type = "money5";

  const [data, fields] = await connection.execute(` SELECT value,lockAmount,status,slug FROM variable where \`key\` = '${type}'` );
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
  console.log("compare2", slug, beforeCompare2, beforeCompare, compare, lastRSI);

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

async function checkOrder() {
  const [data, fields] = await connection.execute("SELECT * FROM trade_log WHERE status=0 AND order_id != '' ");
  const [biteFlag, fileds] = await connection.execute("SELECT status, slug FROM variable WHERE `key` = 'upbitBiteFlag' ");

  if (!data) return;
  var upbitCoinData = {};
  for (let i = 0; i < data.length; i++) {
    if (!data[i].order_id) return;
    try {
      var trade_amount = 0;
      var trade_fee = 0;
      var trade_units = 0;
      var trade_slug = data[i].slug;
      /*
      result { uuid: '7597a297-7c2e-43dc-ac56-34849ecd3e38',
      side: 'ask',
      ord_type: 'limit',
      price: '2939000.0',
      state: 'cancel',
      market: 'KRW-ETH',
      created_at: '2021-06-16T17:27:00+09:00',
      volume: '0.2703',
      remaining_volume: '0.2703',
      reserved_fee: '0.0',
      remaining_fee: '0.0',
      paid_fee: '0.0',
      locked: '0.2703',
      executed_volume: '0.0',
      trades_count: 0,
      trades: [] }
      */
    
      var result = await upbit.orderInfo(data[i].order_id);
      var nowPrice = await upbit.coinPrice(data[i].slug);
      
      var firstDate = new Date(result.created_at);
      var secondDate = new Date();
      var timeDifference = Math.abs(secondDate.getTime() - firstDate.getTime());

      let differentMin = Math.ceil(timeDifference / (1000 * 60 ));
      let differentHours = Math.ceil(timeDifference / (1000 * 3600 ));

      console.log("waitting "+differentMin+"min now --", data[i].slug,nowPrice," -> ",data[i].buysellPrice);

      //완료
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

        await connection.execute(` UPDATE trade_log SET statusStr = '${result.state}', status =1 ,price='${trade_amount}', `+
                                 ` lockAmount='${trade_units}',fee='${trade_fee}' WHERE \`id\` = '${data[i].id}' `);
        //구매완료
        if (result.side == "bid") {
          console.log("bid completed", trade_amount, leftValue, trade_fee);
          var bidVal = Number(leftValue[0].value) - trade_amount;
          await connection.execute(` UPDATE variable SET status = 4,value='${bidVal}',lockAmount = '${trade_units}',`+
                                   ` lastPrice = '${result.price}' WHERE \`key\` = '${data[i].type}'`);

          if(biteFlag[0].status ==0){
            await connection.execute(`UPDATE upbit_coin SET weight = weight+2 WHERE \`market\` = '${data[i].slug}'` );
            await connection.execute(`UPDATE upbit_coin SET weight = if(weight>0,weight -0.5,weight) WHERE \`market\` != '${data[i].slug}'`);
          }

        } else if (result.side == "ask") {

          //다음 주문시 trade fee 미리 차감
          trade_amount = trade_amount - trade_fee- trade_fee ;
          trade_amount = Math.floor(trade_amount);

          console.log("ask completed", trade_amount, leftValue[0].value, trade_fee);
          await connection.execute(`UPDATE variable SET status = 3,value = value + '${trade_amount}' WHERE \`key\` = '${data[i].type}'`);

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

        //판매 대기 중 취소했을때
        if (status[0].status == 1) {
          var coinPrice = await upbit.coinPrice(trade[0].slug);

          await sell( trade[0].type, trade[0].lockAmount, coinPrice, false, trade[0].slug, "upbit" );
          await connection.execute(` UPDATE variable SET status = 1,value = value+${trade[0].price} WHERE \`key\` = '${data[i].type}'` );
          await connection.execute(` UPDATE trade_log SET statusStr = '${result.state}', status =1 WHERE type='${data[i].type}'` );
        
        //구매 대기 중 취소했을때
        } else {
        
          await connection.execute( `UPDATE variable SET status = 3 WHERE \`key\` = '${data[i].type}'` );
        }
        await connection.execute( `UPDATE trade_log SET statusStr = '${result.state}', status =1 WHERE \`id\` = '${data[i].id}'` );

      //구매 판매 확인 프로세스
      }else if(result.side == "ask" && result.state=="wait" && differentHours>1){
        if(data[i].type=="upbitMoney"){
          console.log('판매 대기중', nowPrice, data[i].buysellPrice*0.996)

        }
        if(data[i].type=="upbitMoney" && nowPrice > data[i].buysellPrice*0.996 &&  false){

          const cancelRst = await upbit.cancel(result.uuid);
          console.log('cancelRst',cancelRst);
          await connection.execute(
            "UPDATE variable SET slug = '"+trade_slug+"', status = 1 WHERE `key` = 'upbitBiteFlag'"
          );
          console.log(data[i].type, data[i].lockAmount, nowPrice, false, trade_slug, "upbit");
          
          await sell(data[i].type, data[i].lockAmount, nowPrice, false, trade_slug, "upbit");

        }

      }else if(result.side == "bid" && result.state=="wait" && differentHours>1){

        console.log('구매 대기중')
   

      } 
    
    } catch (e) {
      console.log('mysql error',e)
    }
  }
}

async function upbitTrade(connection) {
  const [upData, fields] = await connection.execute(
    "SELECT * FROM variable where `key` LIKE 'upbit%'"
  );
  const [biteFlag, fileds] = await connection.execute(
    "SELECT status, slug, weight FROM variable WHERE `key` = 'upbitBiteFlag' "
  );

  var upbitData;
  var inputRSI15 = {
    values: [],
    period: 14,
  };
  var getCoin = false;
  var boughtItem = [];
  var showCoinData = true;
  for (let x = 0; x < upData.length; x++) {
    if (upData[x].status == 3) getCoin = true;
  }

  if (getCoin) upbitData = await upbit.useCoinInfo(connection, 5, 100);

  for (let x = 0; x < upData.length; x++) {
    const [upData2, fields] = await connection.execute(
      "SELECT * FROM variable where `key` LIKE 'upbit%'"
    );
    for (let x = 0; x < upData2.length; x++) {
      if (upData2[x].status != 3 && upData2[x].slug!="") boughtItem.push(upData2[x].slug)
    }
    const valueStatus = upData[x].status;
    const lastPrice = upData[x].lastPrice;
    const slug = upData[x].slug;
    const value = upData[x].value;
    const lockAmount = upData[x].lockAmount;
    const type = upData[x].key;
    var buyFlag = false;

    if (valueStatus == 3) {
      
      var buyItem = {
        type:type,
        value:value,
        trade_price:0,
        market: "",
        rsi:100
      };

      for (let i = 0; i < upbitData.length; i++) {

        inputRSI15.values = [];
        const market = upbitData[i].market;
        const priceData = upbitData[i].data;
        const weight = upbitData[i].weight;

        for (let j = priceData.length - 1; j >= 0; j--) {
          await inputRSI15.values.push(priceData[j].trade_price);
        }
        const rsiRes15 = await RSI.calculate(inputRSI15);
        var lastRSI15 =
          rsiRes15[rsiRes15.length - 1] >= 0
            ? rsiRes15[rsiRes15.length - 1]
            : 0;

        if(biteFlag[0].status==1){
          if(market != biteFlag[0].slug){
            rsiRes15[rsiRes15.length - 1] += 15;
            lastRSI15 = rsiRes15[rsiRes15.length - 1];
          }else{
            lastRSI15 -= biteFlag[0].weight;
          }
        }

        if(showCoinData) console.log("market", market, lastRSI15, priceData[0].trade_price, weight, CONFIG.LOW_POINT, market,boughtItem);
        if (!boughtItem.includes(market) && (await upbitCompare(1, rsiRes15, priceData[0].trade_price, 0, weight))) {
          buyFlag = true;
          if(buyItem.rsi>lastRSI15){
            buyItem.market = market;
            buyItem.rsi = lastRSI15;
            buyItem.trade_price = priceData[0].trade_price
          }

        }
      }
      showCoinData =false;
      if(buyFlag){
        console.log('buyITem',buyItem)
        await buy(
          type,
          value,
          buyItem.trade_price,
          false,
          buyItem.market
        );
      }
    } else if (valueStatus == 4) {
      var coinPrice = await upbit.coinPrice(slug);
      console.log("coinPrice", lockAmount, lastPrice, slug, coinPrice);
      //if(await upbitCompare(2,0,lastPrice,coinPrice)) await sell(type,lockAmount,coinPrice,false,slug,"upbit")
      await sell(type, lockAmount, lastPrice * 1.0055, false, slug, "upbit");
    }
  }
}

async function call(event, context, callback) {
  //mailService('test')
  const cmc_key = getCmcKey();
  connection = await mysql_dbc.init();
  
  try {
    var ticker = await upbit.getTicker();

    await checkOrder();
    await upbitTrade(connection);

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
