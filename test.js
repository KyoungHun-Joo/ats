const mysql_dbc = require('./db_con')();

var connection;
const gap = 4;
const lowPoint = 33.3+gap;
const highPoint = 66.6-gap;

async function call(){

  connection = await mysql_dbc.init();

  var buy = false;
  var buyCnt = 0;
  var buyPrice = 0;
  var born = 45000;
  var unit = 0;
  var nowPrice = 0;
  const [priceData, fields] = await connection.execute("SELECT * FROM price ORDER BY date_key DESC LIMIT 1000");

  for(let i=priceData.length-1; i>=0; i--){
    nowPrice = priceData[i].price;
    if(!buy && priceData[i].rsi <=lowPoint){

      const lockAmount = Math.floor((born/priceData[i].price)*1000)/1000;
      born -= lockAmount * priceData[i].price;
      unit = lockAmount;
      buyPrice = priceData[i].price;
      buyCnt++;
      buy = true;
    }

    if(buy && priceData[i].rsi >=highPoint){
      if(buyPrice*1.01 < priceData[i].price){
        const tradeFee = unit * priceData[i].price * 0.0025;
        buy = false;
        born += ((unit * priceData[i].price) - tradeFee);
      }
    }

  } 
  console.log('buyCnt = ', buyCnt)      
  console.log('left = ', born)
  console.log('unit = ', unit)
  console.log('buyPrice = ', buyPrice)    
  console.log('nowPrice = ', nowPrice)      

}

call();