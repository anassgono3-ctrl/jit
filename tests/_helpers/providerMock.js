"use strict";
// tests/_helpers/providerMock.ts
// Stubs ethers' JsonRpcProvider.detectNetwork() to avoid real-network checks during tests.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreJsonRpcProviderDetectNetwork = exports.stubJsonRpcProviderDetectNetwork = void 0;
const sinon_1 = __importDefault(require("sinon"));
const ethers_1 = require("ethers");
let restoreFn;
function stubJsonRpcProviderDetectNetwork() {
    const proto = ethers_1.JsonRpcProvider.prototype;
    if (!proto || typeof proto.detectNetwork !== 'function') {
        // Nothing to stub; return a no-op restore.
        return () => { };
    }
    const stub = sinon_1.default.stub(proto, 'detectNetwork').callsFake(async function () {
        // Return a harmless "mainnet" shape; consumers usually just check existence.
        return { chainId: 1, name: 'homestead' };
    });
    restoreFn = () => {
        stub.restore();
        restoreFn = undefined;
    };
    return restoreFn;
}
exports.stubJsonRpcProviderDetectNetwork = stubJsonRpcProviderDetectNetwork;
function restoreJsonRpcProviderDetectNetwork() {
    if (restoreFn) {
        restoreFn();
    }
}
exports.restoreJsonRpcProviderDetectNetwork = restoreJsonRpcProviderDetectNetwork;
//# sourceMappingURL=providerMock.js.map