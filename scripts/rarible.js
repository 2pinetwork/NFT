/* global process */
/* eslint no-console: 0 */
const hre = require('hardhat');
const fetch = require('node-fetch')
const fs = require("fs");
const FormData = require("form-data");

// In case of the script fails or make a partial work
let filesInfo = {}
try { filesInfo = JSON.parse(fs.readFileSync(`./filesInfo.json`)) } catch (_) { }


// Custom 1155 ABI
const ABI = [
  {
    "constant":false,
    "inputs":[
      { "internalType":"uint256", "name":"id", "type":"uint256" },
      { "internalType":"uint8", "name":"v", "type":"uint8" },
      { "internalType":"bytes32", "name":"r", "type":"bytes32" },
      { "internalType":"bytes32", "name":"s", "type":"bytes32" },
      {
        "components":[
          { "internalType":"address payable", "name":"recipient", "type":"address" },
          { "internalType":"uint256", "name":"value", "type":"uint256" }
        ], "internalType":"struct ERC1155Base.Fee[]", "name":"fees", "type":"tuple[]"
      },
      { "internalType":"uint256", "name":"supply", "type":"uint256" },
      { "internalType":"string", "name":"uri", "type":"string" }
    ],
    "name":"mint",
    "outputs":[],
    "payable":false,
    "stateMutability":"nonpayable",
    "type":"function"
  }
]

const CONTRACT_ADDR = '0x75c8adc79d4dc25d62dcbb0e5bc4c877d55ccf09'

let owner
let contract

const fileToIPFS = async (file) => {
  let url = `https://api.pinata.cloud/pinning/pinFileToIPFS`;
  let data = new FormData();

  data.append("file", fs.readFileSync(`./${file}`), { contentType: 'image/png', name: file, filename: file });
  data.append('pinataMetadata', JSON.stringify({
    name: file,
  }))
  data.append('pinataOptions',JSON.stringify({
    cidVersion: 0,
    customPinPolicy: {
      regions: [
        {
          id: 'NYC1',
          desiredReplicationCount: 1
        }
      ]
     }
  }))

  raw = await fetch(url, {
      method: 'POST',
      body: data,
      headers: {
        pinata_api_key:        process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
      }
    });

  return (await raw.json())
};

const jsonToIPFS = async (data) => {
  const url = `https://api.pinata.cloud/pinning/pinJSONToIPFS`;

  metadata = {
    "name":         data.name,
    "description":  data.description,
    "image":        `ipfs://ipfs/${data.imageIPFS}`,
    "external_url": `https://rinkeby.rarible.com/token/${CONTRACT_ADDR}:${data.index}`,
    "attributes":   []
  }

  console.log('Subiendo json', metadata)

  const raw = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(metadata),
    headers: {
      'Content-Type':        'application/json',
      pinata_api_key:        process.env.PINATA_API_KEY,
      pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
    }
  })

  return (await raw.json())
}

const buildNextImage = async (name, description, filename) => {
  filesInfo[filename] = filesInfo[filename] || {}

  // Get the next NFT ID + s,v,r params
  let tokenId = filesInfo[filename]['tokenId']

  if (!tokenId) {
    // api-staging is for Rinkeby
    const resp = await fetch(`https://ethereum-api-staging.rarible.org/v0.1/nft/collections/${CONTRACT_ADDR}/generate_token_id?minter=${owner.address}`);
    tokenId = (await resp.json())

    if (!tokenId.tokenId) {
      console.log(`Error getting NFT ID: ${JSON.stringify(tokenId)}`)
      return
    }

    filesInfo[filename]['tokenId'] = tokenId
  }

  let imageData = filesInfo[filename]['imageData']

  if (!imageData) {
    imageData = await fileToIPFS(filename)

    if (!imageData.IpfsHash) {
      return `Error uploading file: ${JSON.stringify(imageData)}`
    }
    filesInfo[filename]['imageData'] = imageData
  }

  let jsonData = filesInfo[filename]['jsonData']

  if (!jsonData) {
    jsonData = await jsonToIPFS({
      name:        name,
      description: description,
      imageIPFS:   imageData.IpfsHash,
      index:       tokenId.tokenId
    })

    if (!jsonData.IpfsHash) {
      console.log(`Error uploading json`, jsonData)
      return
    }
    filesInfo[filename]['jsonData'] = jsonData
  }


  return [
    tokenId.tokenId,
    tokenId.signature.v,
    tokenId.signature.r,
    tokenId.signature.s,
    [], // Royalties are set as basis point, so 1000 = 10%.
    1,
    `/ipfs/${jsonData.IpfsHash}`
  ];
}

const main = async function () {
  owner = (await ethers.getSigners())[0]
  contract = new ethers.Contract(CONTRACT_ADDR, ABI, owner);

  let nftData = {}
  let buildPromises = []

  for (let filename in filesInfo) {
    let info = filesInfo[filename]

    buildPromises.push(
      buildNextImage(info.name, info.description, filename).then(nft => {
        nftData[filename] = nft
      })
    )
  }

  await Promise.all(buildPromises)

  let waitingTxs = []

  for (let filename in nftData) {
    // wait until the transaction is in mempool
    try {
      let tx = await contract.mint(...nftData[filename])
      filesInfo[filename]['tx'] = tx.hash
      waitingTxs.push(tx.wait())
    } catch (e) {
      console.log(`Failed transaction for ${filename}`)
    }
  }

  await Promise.all(waitingTxs)

  fs.writeFileSync('filesInfo.json', JSON.stringify(filesInfo, undefined, 2))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);

    fs.writeFileSync('filesInfo.json', JSON.stringify(filesInfo, undefined, 2))
    process.exit(1);
  });
