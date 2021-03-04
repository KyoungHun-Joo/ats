
//priceArr == 최근 1000개 데이터
async function strategy(connection, priceData, term=60){
 
  var buyCnt = 0;
  var sellCnt = 0;
  var buy = false;
  var buyPrice = 0;
  var born = 100000;
  var buyUnit = 0;
  
  for(let i=priceData.length-1; i>=0; i--){
    const current = priceData[i];
    console.log(i,current.rsi)
    if(!buy && current.rsi<33.3){
      
      const lockAmount = Math.floor((born/current.price)*1000)/1000;
      born -= lockAmount * current.price;
      buyUnit = lockAmount;
      buyPrice = current.price;
      buyCnt++;
      buy = true;
      console.log('buy',buyUnit,buyPrice)
    }

    if(buy && buyPrice*1.0125 < current.price){
      const tradeFee = buyUnit * current.price * 0.0025;
      buy = false;
      born += ((buyUnit * current.price) - tradeFee);
      buyUnit = 0;
      console.log('sell',born, buyUnit,buyPrice)

    }


  }

  console.log(born+(buyUnit*priceData[priceData.length-1].price) ,born,buyUnit,priceData[priceData.length-1].price)


}

module.exports = strategy;
