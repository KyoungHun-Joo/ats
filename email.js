const AWS = require('aws-sdk');

const aws_region = "ap-northeast-2"
const senderAddress = "wnrudgns73@naver.com";
const toAddress = "wnrudgns73@naver.com";
const appId = "97d466dcd3c846a4bdcea91542385453";


var charset = "UTF-8";
AWS.config.update({region:aws_region});

//Create a new Pinpoint object.
var pinpoint = new AWS.Pinpoint();

// Specify the parameters to pass to the API.

function sendMail(msg){
  var params = {
    ApplicationId: appId,
    MessageRequest: {
      Addresses: {
        [toAddress]:{
          ChannelType: 'EMAIL'
        }
      },
      MessageConfiguration: {
        EmailMessage: {
          FromAddress: senderAddress,
          SimpleEmail: {
            Subject: {
              Charset: charset,
              Data: msg
            }
          }
        }
      }
    }
  };

  pinpoint.sendMessages(params, function(err, data) {
    // If something goes wrong, print an error message.
    if(err) {
      console.log(err.message);
    } else {
      console.log(data);
      console.log("Email sent! Message ID: ", data['MessageResponse']['Result'][toAddress]['MessageId']);
    }
  });
}


module.exports = sendMail;
