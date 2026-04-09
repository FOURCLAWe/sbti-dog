// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract SBTIResultNFT is ERC1155, Ownable, ERC2981 {
    using Strings for uint256;

    error InvalidTokenId();
    error MintClosed();
    error AlreadyMinted(address account);

    uint256 public constant MAX_TOKEN_ID = 27;

    string public name;
    string public symbol;
    string public contractURI;
    string private _metadataBaseURI;
    bool public mintEnabled;

    mapping(address => bool) private _walletHasMinted;
    mapping(uint256 => string) public resultCode;

    event ResultMinted(address indexed account, uint256 indexed tokenId, string code);
    event MintStatusUpdated(bool enabled);
    event MetadataBaseURIUpdated(string uri);
    event ContractURIUpdated(string uri);

    constructor(
        address initialOwner,
        string memory name_,
        string memory symbol_,
        string memory metadataBaseURI_,
        string memory contractURI_,
        address royaltyReceiver,
        uint96 royaltyFeeNumerator
    ) ERC1155("") Ownable(initialOwner) {
        name = name_;
        symbol = symbol_;
        contractURI = contractURI_;
        _metadataBaseURI = metadataBaseURI_;
        mintEnabled = true;

        if (royaltyReceiver != address(0) && royaltyFeeNumerator > 0) {
            _setDefaultRoyalty(royaltyReceiver, royaltyFeeNumerator);
        }

        _setResultCodes();
    }

    function mint(uint256 tokenId) external {
        _assertValidTokenId(tokenId);
        if (!mintEnabled) revert MintClosed();
        if (_walletHasMinted[msg.sender]) revert AlreadyMinted(msg.sender);

        _walletHasMinted[msg.sender] = true;
        _mint(msg.sender, tokenId, 1, "");

        emit ResultMinted(msg.sender, tokenId, resultCode[tokenId]);
    }

    function ownerMint(address to, uint256 tokenId, uint256 amount) external onlyOwner {
        _assertValidTokenId(tokenId);
        if (amount > 0) {
            _walletHasMinted[to] = true;
        }
        _mint(to, tokenId, amount, "");
    }

    function ownerMintBatch(address to, uint256[] calldata tokenIds, uint256[] calldata amounts) external onlyOwner {
        for (uint256 i = 0; i < tokenIds.length; i += 1) {
            _assertValidTokenId(tokenIds[i]);
        }

        for (uint256 i = 0; i < amounts.length; i += 1) {
            if (amounts[i] > 0) {
                _walletHasMinted[to] = true;
                break;
            }
        }

        _mintBatch(to, tokenIds, amounts, "");
    }

    function hasMinted(address account, uint256 /* tokenId */) public view returns (bool) {
        return _walletHasMinted[account];
    }

    function hasWalletMinted(address account) external view returns (bool) {
        return _walletHasMinted[account];
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        _assertValidTokenId(tokenId);
        return string.concat(_metadataBaseURI, tokenId.toString(), ".json");
    }

    function setMintEnabled(bool enabled) external onlyOwner {
        mintEnabled = enabled;
        emit MintStatusUpdated(enabled);
    }

    function setMetadataBaseURI(string calldata nextBaseURI) external onlyOwner {
        _metadataBaseURI = nextBaseURI;
        emit MetadataBaseURIUpdated(nextBaseURI);
    }

    function metadataBaseURI() external view returns (string memory) {
        return _metadataBaseURI;
    }

    function setContractURI(string calldata nextContractURI) external onlyOwner {
        contractURI = nextContractURI;
        emit ContractURIUpdated(nextContractURI);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function clearDefaultRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _assertValidTokenId(uint256 tokenId) internal pure {
        if (tokenId == 0 || tokenId > MAX_TOKEN_ID) revert InvalidTokenId();
    }

    function _setResultCodes() internal {
        resultCode[1] = "CTRL";
        resultCode[2] = "ATM-er";
        resultCode[3] = "Dior-s";
        resultCode[4] = "BOSS";
        resultCode[5] = "THAN-K";
        resultCode[6] = "OH-NO";
        resultCode[7] = "GOGO";
        resultCode[8] = "SEXY";
        resultCode[9] = "LOVE-R";
        resultCode[10] = "MUM";
        resultCode[11] = "FAKE";
        resultCode[12] = "OJBK";
        resultCode[13] = "MALO";
        resultCode[14] = "JOKE-R";
        resultCode[15] = "WOC!";
        resultCode[16] = "THIN-K";
        resultCode[17] = "SHIT";
        resultCode[18] = "ZZZZ";
        resultCode[19] = "POOR";
        resultCode[20] = "MONK";
        resultCode[21] = "IMSB";
        resultCode[22] = "SOLO";
        resultCode[23] = "FUCK";
        resultCode[24] = "DEAD";
        resultCode[25] = "IMFW";
        resultCode[26] = "DRUNK";
        resultCode[27] = "HHHH";
    }
}
