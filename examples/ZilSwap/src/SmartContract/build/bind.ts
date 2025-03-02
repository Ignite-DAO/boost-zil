/** @format */

import { BN, Long } from "@zilliqa-js/util";
import { Transaction, TxParams } from "@zilliqa-js/account";
import { Contract } from "@zilliqa-js/contract";
import * as T from "boost-zil";
import { signTransition } from "boost-zil";
import { Zilliqa } from "@zilliqa-js/zilliqa";
import { ContractSubStateQueryCast, partialState } from "boost-zil";

/**
 * this string is the signature of the hash of the source code
 * that was used to generate this sdk
 */
export const contractSignature =
  "hash_0x5bb178536ac7f3a49daf721f01377930f73d946fa3b50721acc2be9d00b40e34";
const sig: {
  contractSignature: "hash_0x5bb178536ac7f3a49daf721f01377930f73d946fa3b50721acc2be9d00b40e34";
} = { contractSignature };

export const code = `
(* sourceCodeHash=0x5bb178536ac7f3a49daf721f01377930f73d946fa3b50721acc2be9d00b40e34 *)
(* sourceCodeHashKey=hash_0x5bb178536ac7f3a49daf721f01377930f73d946fa3b50721acc2be9d00b40e34 *)
scilla_version 0

import BoolUtils IntUtils

library ZilSwap

type Denom =
  | Zil
  | Token of ByStr20 
type Coins = | Coins of Denom Uint128 
type Pool = | Pool of Uint128 Uint128 
type SwapDirection = | ZilToToken | TokenToZil
type ExactSide = | ExactInput | ExactOutput
type Swap = | Swap of (Option Pool) SwapDirection ExactSide Uint128 (Option Uint128) Uint256 
type ResultOrError =
 | Result of Pool Uint128 
 | Error of String

let zero = Uint128 0
let one = Uint128 1
let min_liquidity = Uint128 1000000000000000 
let fee_denom = Uint256 10000 
let zil_address = 0x0000000000000000000000000000000000000000
let zil = Zil

let oneMsg : Message -> List Message =
  fun (msg : Message) =>
    let nil_msg = Nil {Message} in
    Cons {Message} msg nil_msg

let grow : Uint128 -> Uint256 =
  fun (var : Uint128) =>
    let maybe_big = builtin to_uint256 var in
    match maybe_big with
    | Some big => big
    | None => Uint256 0 
    end


let frac : Uint128 -> Uint128 -> Uint128 -> Option Uint128  =
  fun (d : Uint128) =>
  fun (x : Uint128) =>
  fun (y : Uint128) =>
    let big_x = grow x in
    let big_y = grow y in
    let big_d = grow d in
    let d_times_y = builtin mul big_d big_y in
    let d_times_y_over_x = builtin div d_times_y big_x in
    builtin to_uint128 d_times_y_over_x


let outputFor : Uint128 -> Uint128 -> Uint128 -> Uint256 -> Option Uint128 =
  fun (input_amount_u128 : Uint128) =>
  fun (input_reserve_u128 : Uint128) =>
  fun (output_reserve_u128 : Uint128) =>
  fun (after_fee : Uint256) =>
    let input_amount = grow input_amount_u128 in
    let input_reserve = grow input_reserve_u128 in
    let output_reserve = grow output_reserve_u128 in
    let input_amount_after_fee = builtin mul input_amount after_fee in
    let numerator = builtin mul input_amount_after_fee output_reserve in
    let denominator =
      let d1 = builtin mul input_reserve fee_denom in
      builtin add d1 input_amount_after_fee in
    let result = builtin div numerator denominator in
    builtin to_uint128 result


let inputFor : Uint128 -> Uint128 -> Uint128 -> Uint256 -> Option Uint128 =
  fun (output_amount_u128 : Uint128) =>
  fun (input_reserve_u128 : Uint128) =>
  fun (output_reserve_u128 : Uint128) =>
  fun (after_fee : Uint256) =>
    let output_amount = grow output_amount_u128 in
    let input_reserve = grow input_reserve_u128 in
    let output_reserve = grow output_reserve_u128 in
    let numerator =
      let n1 = builtin mul input_reserve output_amount in
      builtin mul n1 fee_denom in
    let denominator =
      let d1 = builtin sub output_reserve output_amount in
      builtin mul d1 after_fee in
    let result = builtin div numerator denominator in
    builtin to_uint128 result


let amountFor : Pool -> SwapDirection -> ExactSide -> Uint128 -> Uint256 -> Option Uint128 =
  fun (pool : Pool) =>
  fun (direction : SwapDirection) =>
  fun (exact_side : ExactSide) =>
  fun (exact_amount : Uint128) =>
  fun (after_fee : Uint256) =>
    match pool with
    | Pool zil_reserve token_reserve =>
      let calc = fun (exact: ExactSide) =>
        match exact with
        | ExactInput => outputFor
        | ExactOutput => inputFor
        end in
      match direction with
      | ZilToToken => calc exact_side exact_amount zil_reserve token_reserve after_fee
      | TokenToZil => calc exact_side exact_amount token_reserve zil_reserve after_fee
      end
    end


let withinLimits : Uint128 -> Option Uint128 -> ExactSide -> Bool =
  fun (result_amount : Uint128) =>
  fun (maybe_limit_amount : Option Uint128) =>
  fun (exact_side : ExactSide) =>
    match maybe_limit_amount with
    | None => True
    | Some limit_amount =>
      match exact_side with
      | ExactInput =>
        
        uint128_ge result_amount limit_amount
      | ExactOutput =>
        
        uint128_ge limit_amount result_amount
      end
    end


let resultFor : Swap -> ResultOrError =
  fun (swap : Swap) =>
    match swap with
    | Swap maybe_pool direction exact_side exact_amount maybe_limit_amount after_fee =>
      match maybe_pool with
      | None =>
        let e = "MissingPool" in Error e
      | Some pool =>
        let maybe_amount = amountFor pool direction exact_side exact_amount after_fee in
        match maybe_amount with
        | None =>
          let e = "IntegerOverflow" in Error e
        | Some amount =>
          let within_limits = withinLimits amount maybe_limit_amount exact_side in
          match within_limits with
          | False =>
            let e = "RequestedRatesCannotBeFulfilled" in Error e
          | True =>
            Result pool amount
          end
        end
      end
    end


let poolEmpty : Pool -> Bool =
  fun (p : Pool) =>
    match p with
    | Pool x y =>
      let x_empty = builtin lt x one in
      let y_empty = builtin lt y one in
      orb x_empty y_empty
    end

contract ZilSwap
(
  initial_owner : ByStr20,
  initial_fee : Uint256
)

with
  uint256_le initial_fee fee_denom
=>

field pools : Map ByStr20 Pool = Emp ByStr20 Pool
field balances : Map ByStr20 (Map ByStr20 Uint128) = Emp ByStr20 (Map ByStr20 Uint128)
field total_contributions : Map ByStr20 Uint128 = Emp ByStr20 Uint128
field output_after_fee : Uint256 = builtin sub fee_denom initial_fee
field owner : ByStr20 = initial_owner
field pending_owner : ByStr20 = zil_address

procedure ThrowIfExpired(deadline_block: BNum)
  current_block <- & BLOCKNUMBER;
  is_not_expired = builtin blt current_block deadline_block;
  match is_not_expired with
  | True =>
  | False =>
    e = { _exception : "TransactionExpired" };
    throw e
  end
end

procedure ThrowIfZero(number: Uint128)
  gt_zero = uint128_gt number zero;
  match gt_zero with
  | True =>
  | False =>
    e = { _exception : "InvalidParameter" };
    throw e
  end
end

procedure ThrowIfZil(address : ByStr20)
  is_zil = builtin eq address zil_address;
  match is_zil with
  | False =>
  | True =>
    e = { _exception : "InvalidParameter" };
    throw e
  end
end

procedure ThrowUnlessSenderIsOwner()
  current_owner <- owner;
  is_owner = builtin eq _sender current_owner;
  match is_owner with
  | True =>
  | False =>
    e = { _exception : "InvalidSender" };
    throw e
  end
end

procedure Send(coins : Coins, to_address : ByStr20)
  match coins with
  | Coins denom amount =>
    match denom with
    | Zil =>
      msg = { _tag : "AddFunds"; _recipient: to_address; _amount: amount };
      msgs = oneMsg msg;
      send msgs
    | Token token =>
      msg_to_token =  {
        _tag : "Transfer"; _recipient: token; _amount: zero;
        to: to_address; amount: amount
      };
      msgs = oneMsg msg_to_token;
      send msgs
    end
  end
end

procedure Receive(coins : Coins)
  match coins with
  | Coins denom amount =>
    match denom with
    | Zil =>
      needs_refund = uint128_gt _amount amount;
      accept;
      match needs_refund with
      | True =>
        refund =
          let refund_amount = builtin sub _amount amount in
          Coins zil refund_amount;
        Send refund _sender
      | False => 
      end
    | Token token =>
      msg_to_token = {
        _tag : "TransferFrom"; _recipient: token; _amount: zero;
        from: _sender; to: _this_address; amount: amount
      };
      msgs = oneMsg msg_to_token;
      send msgs
    end
  end
end

procedure DoSwap(
  pool : Pool,
  token_address : ByStr20,
  input : Coins,
  output : Coins,
  input_from : ByStr20,
  output_to : ByStr20
)
  match pool with
  | Pool x y => 

    
    match input with
    | Coins input_denom input_amount =>
      match output with
      | Coins output_denom output_amount =>
        match input_denom with
        | Zil =>
          new_pool =
            let new_x = builtin add x input_amount in
            let new_y = builtin sub y output_amount in
          Pool new_x new_y;
          pools[token_address] := new_pool
        | Token t =>
          new_pool =
            let new_x = builtin sub x output_amount in
            let new_y = builtin add y input_amount in
          Pool new_x new_y;
          pools[token_address] := new_pool
        end
      end
    end;

    
    sending_from_self = builtin eq input_from _this_address;
    match sending_from_self with
    | True => 
    | False => Receive input 
    end;

    sending_to_self = builtin eq output_to _this_address;
    match sending_to_self with
    | True => 
    | False => Send output output_to 
    end;

    
    e = {
      _eventname: "Swapped";
      pool: token_address; address: _sender;
      input: input; output: output
    };
    event e
  end
end


procedure DoSwapTwice(
  pool0 : Pool,
  token0_address : ByStr20,
  pool1 : Pool,
  token1_address : ByStr20,
  input_amount : Uint128,
  intermediate_amount : Uint128,
  output_amount : Uint128,
  recipient_address : ByStr20
)
  input = let token0 = Token token0_address in
    Coins token0 input_amount;
  intermediate = Coins zil intermediate_amount;
  output = let token1 = Token token1_address in
    Coins token1 output_amount;
  DoSwap
    pool0
    token0_address
    input
    intermediate
    _sender
    _this_address
  ;
  DoSwap
    pool1
    token1_address
    intermediate
    output
    _this_address
    recipient_address
end

procedure SwapUsingZIL(
  token_address : ByStr20,
  direction : SwapDirection,
  exact_side : ExactSide,
  exact_amount : Uint128,
  limit_amount : Uint128,
  deadline_block : BNum,
  recipient_address : ByStr20
)
  ThrowIfExpired deadline_block;
  ThrowIfZero exact_amount;
  ThrowIfZero limit_amount;

  after_fee <- output_after_fee;
  maybe_pool <- pools[token_address];
  result =
    let option_limit_amount = Some {Uint128} limit_amount in
    let swap = Swap maybe_pool direction exact_side exact_amount option_limit_amount after_fee in
    resultFor swap;

  match result with
  | Error msg =>
    e = { _exception : msg };
    throw e
  | Result pool calculated_amount =>
    token = Token token_address;
    match exact_side with
    | ExactInput =>
      match direction with
      | ZilToToken =>
        input = Coins zil exact_amount;
        output = Coins token calculated_amount;
        DoSwap pool token_address input output _sender recipient_address
      | TokenToZil =>
        input = Coins token exact_amount;
        output = Coins zil calculated_amount;
        DoSwap pool token_address input output _sender recipient_address
      end
    | ExactOutput =>
      match direction with
      | ZilToToken =>
        input = Coins zil calculated_amount;
        output = Coins token exact_amount;
        DoSwap pool token_address input output _sender recipient_address
      | TokenToZil =>
        input = Coins token calculated_amount;
        output = Coins zil exact_amount;
        DoSwap pool token_address input output _sender recipient_address
      end
    end
  end
end

transition RecipientAcceptTransferFrom(
  initiator : ByStr20,
  sender : ByStr20,
  recipient : ByStr20,
  amount : Uint128
)
  is_valid_transfer_to_self =
    let self_triggered = builtin eq initiator _this_address in
    let is_transfer_to_self = builtin eq recipient _this_address in
    andb self_triggered is_transfer_to_self;

  match is_valid_transfer_to_self with
  | False =>
    e = { _exception : "InvalidInvocation" };
    throw e
  | True => 
  end
end

transition TransferFromSuccessCallBack(
  initiator : ByStr20,
  sender : ByStr20,
  recipient : ByStr20,
  amount : Uint128
)
end

transition TransferSuccessCallBack(
  sender : ByStr20,
  recipient : ByStr20,
  amount : Uint128
)
end

transition SetFee(
  new_fee : Uint256
)
  ThrowUnlessSenderIsOwner;
  is_valid_fee = uint256_le new_fee fee_denom;
  match is_valid_fee with
  | False =>
    e = { _exception : "InvalidParameter" };
    throw e
  | True =>
    new_output_after_fee = builtin sub fee_denom new_fee;
    output_after_fee := new_output_after_fee;
    e = { _eventname: "FeeSet"; fee: new_fee };
    event e
  end
end

transition TransferOwnership(
  new_owner : ByStr20
)
  ThrowUnlessSenderIsOwner;
  existing_owner <- owner;
  new_owner_is_existing_owner = builtin eq new_owner existing_owner;
  match new_owner_is_existing_owner with
  | True =>
    e = { _exception : "InvalidParameter" };
    throw e
  | False =>
    pending_owner := new_owner
  end
end

transition AcceptPendingOwnership()
  new_owner <- pending_owner;
  sender_is_pending_owner = builtin eq _sender new_owner;
  match sender_is_pending_owner with
  | False =>
    e = { _exception : "InvalidSender" };
    throw e
  | True =>
    owner := new_owner;
    pending_owner := zil_address;
    e = { _eventname: "OwnershipTransferred"; owner: new_owner };
    event e
  end
end

transition AddLiquidity(
  token_address : ByStr20,
  min_contribution_amount : Uint128,
  max_token_amount : Uint128,
  deadline_block : BNum
)
  ThrowIfExpired deadline_block;
  ThrowIfZil token_address;
  ThrowIfZero _amount;
  ThrowIfZero max_token_amount;

  token = Token token_address;

  
  zils_in = Coins zil _amount;
  Receive zils_in;

  maybe_pool <- pools[token_address];
  match maybe_pool with
  | None =>
    min_zil_contributed = uint128_ge _amount min_liquidity;
    match min_zil_contributed with
    | False =>
      e = { _exception : "InvalidParameter" };
      throw e
    | True =>
      tokens_in = Coins token max_token_amount;
      Receive tokens_in;

      new_pool = Pool _amount max_token_amount;
      pools[token_address] := new_pool;
      e1 = { _eventname: "PoolCreated"; pool: token_address };
      event e1;

      balances[token_address][_sender] := _amount;
      total_contributions[token_address] := _amount;
      e2 = { _eventname: "Mint"; pool: token_address; address: _sender; amount: _amount };
      event e2
    end
  | Some pool =>
    match pool with
    | Pool x y => 

      
      
      maybe_result = frac _amount x y;
      match maybe_result with
      | None =>
        e = { _exception : "IntegerOverflow" };
        throw e
      | Some result =>
        delta_y = builtin add result one;
        maybe_total_contribution <- total_contributions[token_address];
        match maybe_total_contribution with
        | None =>
          e = { _exception : "MissingContributions" };
          throw e
        | Some total_contribution =>
          maybe_new_contribution = frac _amount x total_contribution;
          match maybe_new_contribution with
          | None =>
            e = { _exception : "IntegerOverflow" };
            throw e
          | Some new_contribution =>
            within_limits =
              let token_lte_max = uint128_le delta_y max_token_amount in
              let contribution_gte_max = uint128_ge new_contribution min_contribution_amount in
              andb token_lte_max contribution_gte_max;
            match within_limits with
            | False =>
              e = { _exception : "RequestedRatesCannotBeFulfilled" ; delta_y: delta_y };
              throw e
            | True =>
              tokens_in = Coins token delta_y;
              Receive tokens_in;

              new_pool =
                let new_x = builtin add x _amount in
                let new_y = builtin add y delta_y in
                Pool new_x new_y;
              pools[token_address] := new_pool;

              existing_balance <- balances[token_address][_sender];
              match existing_balance with
              | Some b =>
                new_balance = builtin add b new_contribution;
                balances[token_address][_sender] := new_balance
              | None =>
                balances[token_address][_sender] := new_contribution
              end;

              new_total_contribution = builtin add total_contribution new_contribution;
              total_contributions[token_address] := new_total_contribution;

              e = { _eventname: "Mint"; pool: token_address; address: _sender; amount: new_contribution };
              event e
            end
          end
        end
      end
    end
  end
end

transition RemoveLiquidity(
  token_address : ByStr20,
  contribution_amount : Uint128,
  min_zil_amount : Uint128,
  min_token_amount : Uint128,
  deadline_block : BNum
)
  ThrowIfExpired deadline_block;
  ThrowIfZero contribution_amount;
  ThrowIfZero min_zil_amount;
  ThrowIfZero min_token_amount;

  token = Token token_address;

  maybe_total_contribution <- total_contributions[token_address];
  match maybe_total_contribution with
  | None =>
    e = { _exception : "MissingPool" };
    throw e
  | Some total_contribution =>
    ThrowIfZero total_contribution;
    maybe_pool <- pools[token_address];
    match maybe_pool with
    | None =>
      e = { _exception : "MissingPool" };
      throw e
    | Some pool =>
      match pool with
      | Pool x y => 
        maybe_zil_amount = frac contribution_amount total_contribution x;
        maybe_token_amount = frac contribution_amount total_contribution y;
        match maybe_zil_amount with
        | None =>
          e = { _exception : "IntegerOverflow" };
          throw e
        | Some zil_amount =>
          match maybe_token_amount with
          | None =>
            e = { _exception : "IntegerOverflow" };
            throw e
          | Some token_amount =>
            within_limits =
              let zil_ok = uint128_ge zil_amount min_zil_amount in
              let token_ok = uint128_ge token_amount min_token_amount in
              andb zil_ok token_ok;
            match within_limits with
            | False =>
              e = { _exception : "RequestedRatesCannotBeFulfilled" };
              throw e
            | True =>
              existing_balance <- balances[token_address][_sender];
              match existing_balance with
              | None =>
                e = { _exception : "MissingBalance" };
                throw e
              | Some b =>
                new_pool =
                  let new_x = builtin sub x zil_amount in
                  let new_y = builtin sub y token_amount in
                  Pool new_x new_y;

                is_pool_now_empty = poolEmpty new_pool;
                match is_pool_now_empty with
                | True =>
                  
                  delete pools[token_address];
                  delete balances[token_address];
                  delete total_contributions[token_address]
                | False =>
                  pools[token_address] := new_pool;
                  new_balance = builtin sub b contribution_amount;
                  balances[token_address][_sender] := new_balance;
                  new_total_contribution = builtin sub total_contribution contribution_amount;
                  total_contributions[token_address] := new_total_contribution
                end;

                zils_out = Coins zil zil_amount;
                tokens_out = Coins token token_amount;
                Send zils_out _sender;
                Send tokens_out _sender;

                e = { _eventname: "Burnt"; pool: token_address; address: _sender; amount: contribution_amount };
                event e
              end
            end
          end
        end
      end
    end
  end
end

transition SwapExactZILForTokens(
  token_address : ByStr20,
  
  min_token_amount : Uint128,
  deadline_block : BNum,
  recipient_address : ByStr20
)
  direction = ZilToToken;
  exact_side = ExactInput;
  exact_amount = _amount;
  limit_amount = min_token_amount;

  SwapUsingZIL
    token_address
    direction
    exact_side
    exact_amount
    limit_amount
    deadline_block
    recipient_address
end

transition SwapExactTokensForZIL(
  token_address : ByStr20,
  token_amount : Uint128,
  min_zil_amount : Uint128,
  deadline_block : BNum,
  recipient_address : ByStr20
)
  direction = TokenToZil;
  exact_side = ExactInput;
  exact_amount = token_amount;
  limit_amount = min_zil_amount;

  SwapUsingZIL
    token_address
    direction
    exact_side
    exact_amount
    limit_amount
    deadline_block
    recipient_address
end

transition SwapZILForExactTokens(
  token_address : ByStr20,
  
  token_amount : Uint128,
  deadline_block : BNum,
  recipient_address : ByStr20
)
  direction = ZilToToken;
  exact_side = ExactOutput;
  exact_amount = token_amount;
  limit_amount = _amount;

  SwapUsingZIL
    token_address
    direction
    exact_side
    exact_amount
    limit_amount
    deadline_block
    recipient_address
end

transition SwapTokensForExactZIL(
  token_address : ByStr20,
  max_token_amount : Uint128,
  zil_amount : Uint128,
  deadline_block : BNum,
  recipient_address : ByStr20
)
  direction = TokenToZil;
  exact_side = ExactOutput;
  exact_amount = zil_amount;
  limit_amount = max_token_amount;

  SwapUsingZIL
    token_address
    direction
    exact_side
    exact_amount
    limit_amount
    deadline_block
    recipient_address
end

transition SwapExactTokensForTokens(
  token0_address : ByStr20,
  token1_address : ByStr20,
  token0_amount : Uint128, 
  min_token1_amount : Uint128, 
  deadline_block : BNum,
  recipient_address : ByStr20
)
  ThrowIfExpired deadline_block;
  ThrowIfZero token0_amount;
  ThrowIfZero min_token1_amount;

  after_fee <- output_after_fee;
  maybe_pool0 <- pools[token0_address];

  result0 =
    let direction = TokenToZil in
    let exact_side = ExactInput in
    let limit_amount = None {Uint128} in
    let swap = Swap maybe_pool0 direction exact_side token0_amount limit_amount after_fee in
      resultFor swap;

  match result0 with
  | Error msg =>
    e = { _exception : msg };
    throw e
  | Result pool0 zil_intermediate_amount =>
    maybe_pool1 <- pools[token1_address];

    result1 =
      let direction = ZilToToken in
      let exact_side = ExactInput in
      let limit_amount = Some {Uint128} min_token1_amount in
      let swap = Swap maybe_pool1 direction exact_side zil_intermediate_amount limit_amount after_fee in
        resultFor swap;

    match result1 with
    | Error msg =>
      e = { _exception : msg };
      throw e
    | Result pool1 output_amount =>
      DoSwapTwice
        pool0
        token0_address
        pool1
        token1_address
        token0_amount
        zil_intermediate_amount
        output_amount
        recipient_address
    end
  end
end

transition SwapTokensForExactTokens(
  token0_address : ByStr20,
  token1_address : ByStr20,
  max_token0_amount : Uint128, 
  token1_amount : Uint128, 
  deadline_block : BNum,
  recipient_address : ByStr20
)
  ThrowIfExpired deadline_block;
  ThrowIfZero max_token0_amount;
  ThrowIfZero token1_amount;

  after_fee <- output_after_fee;
  maybe_pool1 <- pools[token1_address];

  result1 =
    let direction = ZilToToken in
    let exact_side = ExactOutput in
    let limit_amount = None {Uint128} in
    let swap = Swap maybe_pool1 direction exact_side token1_amount limit_amount after_fee in
      resultFor swap;

  match result1 with
  | Error msg =>
    e = { _exception : msg };
    throw e
  | Result pool1 zil_intermediate_amount =>
    maybe_pool0 <- pools[token0_address];

    result0 =
      let direction = TokenToZil in
      let exact_side = ExactOutput in
      let limit_amount = Some {Uint128} max_token0_amount in
      let swap = Swap maybe_pool0 direction exact_side zil_intermediate_amount limit_amount after_fee in
        resultFor swap;

    match result0 with
    | Error msg =>
      e = { _exception : msg };
      throw e
    | Result pool0 input_amount =>
      DoSwapTwice
        pool0
        token0_address
        pool1
        token1_address
        input_amount
        zil_intermediate_amount
        token1_amount
        recipient_address
    end
  end
end`;

declare var window: any;

export type TXLog = (t: Transaction, msg: string) => void;

const thereIsZilPay = () => {
  if (typeof window != "undefined") {
    if (typeof window.zilPay != "undefined") {
      return true;
    }
  }
  return false;
};

const getTrail = () => {
  if (thereIsZilPay()) {
    return [];
  } else {
    return [31, 1000];
  }
};

/**
 * will try to send a transaction to the contract
 * @warning WILL NOT THROW ERRORS IF CONTRACT SIGNATURES ARE INVALID
 */
const dangerousFromJSONDeploy =
  (txLink: TXLog) =>
  ({ getVersion, getZil }: SDKResolvers) =>
  async (t: Omit<Omit<DeployData, "isDeploy">, "code">, gasLimit: Long) => {
    let teardownFun: any;
    try {
      const { zil, teardown } = await getZil(true);
      teardownFun = teardown;
      const gasPrice = await getMinGasPrice(zil);

      const contract = newContract(zil, code, t.data);
      const [tx, con] = await contract.deploy(
        {
          version: getVersion(),
          gasPrice,
          gasLimit,
        },
        ...getTrail()
      );
      await teardown();
      txLink(tx, "Deploy");
      if (!con.address) {
        if (con.error) {
          throw new Error(JSON.stringify(con.error, null, 2));
        }
        throw new Error("Contract failed to deploy");
      }
      return { tx, contract: con, address: new T.ByStr20(con.address) };
    } catch (e) {
      if (teardownFun) {
        await teardownFun();
      }
      throw e;
    }
    throw "this never happens leave me alone ts";
  };

/**
 * will try to send a transaction to the contract
 * @warning WILL NOT THROW ERRORS IF CONTRACT SIGNATURES ARE INVALID
 */
const dangerousFromJSONCall =
  (txLink: TXLog) =>
  ({ getVersion, getZil }: SDKResolvers) =>
  async (t: Omit<CallData, "isDeploy">, gasLimit: Long) => {
    let teardownFun: any;
    try {
      const { zil, teardown } = await getZil(true);
      teardownFun = teardown;
      const gasPrice = await getMinGasPrice(zil);
      const contract = getContract(
        zil,
        new T.ByStr20(t.contractAddress).toSend()
      );

      const tx = await contract.call(
        t.contractTransitionName,
        t.data,
        {
          version: getVersion(),
          amount: new BN(t.amount),
          gasPrice,
          gasLimit,
        },
        ...getTrail()
      );
      await teardown();
      txLink(tx, t.contractTransitionName);
      return { tx };
    } catch (e) {
      if (teardownFun) {
        await teardownFun();
      }
      throw e;
    }
    throw "this never happens leave me alone ts";
  };

export interface SDKResolvers {
  getZil: (
    requireSigner?: boolean
  ) => Promise<{ zil: Zilliqa; teardown: () => Promise<void> }>;
  getVersion: () => number;
  getNetworkName: () => string;
  txLog?: TXLog;
}

const RED = "\x1B[31m%s\x1b[0m";
const CYAN = "\x1B[36m%s\x1b[0m";
const GREEN = "\x1B[32m%s\x1b[0m";
const MAGENTA = "\x1B[35m%s\x1b[0m";

interface Value {
  vname: string;
  type: string;
  value: string | ADTValue | ADTValue[] | string[];
}
interface ADTValue {
  constructor: string;
  argtypes: string[];
  arguments: Value[] | string[];
}

interface DeployData {
  isDeploy: boolean;
  /**
   * the signature hash of the source code of the contract that this data interacts with
   */
  contractSignature: string;
  /**
   * code of the contract to deploy
   */
  code: string;
  data: any[];
}
interface CallData {
  isDeploy: boolean;
  /**
   * the signature hash of the source code of the contract that this data interacts with
   */
  contractSignature: string;
  /**
   * contract to send the transaction to
   */
  contractAddress: string;
  /**
   * zil amount to send
   */
  amount: string;
  /**
   * the name of the transition called in the target contract
   */
  contractTransitionName: string;
  data: any[];
}
/**
 * general interface of the data returned by toJSON() on the transitions
 */
type TransactionData = DeployData | CallData;

function getContract(
  zil: Zilliqa,
  a: string
): Contract & {
  call: (
    transition: string,
    args: Value[],
    params: Pick<
      TxParams,
      "version" | "amount" | "gasPrice" | "gasLimit" | "nonce" | "pubKey"
    >,
    attempts?: number,
    interval?: number,
    toDs?: boolean
  ) => ReturnType<Contract["call"]>;
} {
  const address = new T.ByStr20(a).toSend();
  //@ts-ignore
  return zil.contracts.at(address);
}

function newContract(zil: Zilliqa, code: string, init: Value[]): Contract {
  //@ts-ignore
  return zil.contracts.new(code, init);
}

async function getMinGasPrice(zil: Zilliqa) {
  const res = await zil.blockchain.getMinimumGasPrice();
  if (!res.result) {
    throw "no gas price";
  }
  return new BN(res.result);
}

export const ZilSwap = (resolvers: SDKResolvers) => {
  const logUrl = (id: string, msg: string) => {
    const network = getNetworkName();
    console.log(MAGENTA, msg + " 🔥");
    if (network == "mainnet" || network == "testnet") {
      const url = `https://viewblock.io/zilliqa/tx/0x${id}?network=${network}`;
      console.log(CYAN, url);
    }
  };
  const zilpayLog = (t: Transaction, msg: string) => {
    console.log(t);
    //@ts-ignore
    const id = t.ID;
    logUrl(id as string, msg);
  };
  const nodeLog = (t: Transaction, msg: string) => {
    const id = t.id;
    logUrl(id as string, msg);
    const receipt = t.getReceipt();
    if (receipt) {
      if (receipt.success) {
        console.log(GREEN, "Success.");
      } else {
        console.log(RED, "Failed.");
        if (receipt.exceptions) {
          Object.entries(receipt.exceptions).map(([k, v]) => {
            console.log(RED, v);
          });
        }
      }
      if (receipt.event_logs) {
        const events = receipt.event_logs as {
          _eventname: string;
          address: string;
          params: { value: string; vname: string }[];
        }[];
        if (events.length != 0) {
          console.log(CYAN, `Events🕵️‍♀️`);
          events.forEach((e) => {
            console.log(CYAN, `${e._eventname}`);
            e.params.forEach((p) => {
              console.log(CYAN, `${p.vname}: `);
              console.log(MAGENTA, `${JSON.stringify(p.value, null, 2)}`);
            });
          });
        }
      }
    }
  };
  const defaultTxLog = (t: Transaction, msg: string) => {
    if (thereIsZilPay()) {
      zilpayLog(t, msg);
    } else {
      nodeLog(t, msg);
    }
  };
  const { getZil, getVersion, getNetworkName } = resolvers;
  const txLink = resolvers.txLog ? resolvers.txLog : defaultTxLog;

  return {
    async balance(a: T.ByStr20) {
      const res = await getZil();
      const bal = await res.zil.blockchain.getBalance(a.toSend());
      await res.teardown();
      return new T.Uint128(bal.result.balance);
    },

    /**
     * will try to send a transaction to the contract
     * @warning WILL NOT THROW ERRORS IF CONTRACT SIGNATURES ARE INVALID
     */
    dangerousFromJSONDeploy: dangerousFromJSONDeploy(txLink)(resolvers),

    /**
     * will try to send a transaction to the contract
     * @warning WILL NOT THROW ERRORS IF CONTRACT SIGNATURES ARE INVALID
     */
    dangerousFromJSONCall: dangerousFromJSONCall(txLink)(resolvers),

    deploy: (
      gasLimit: Long,
      __initial_owner: T.ByStr20,
      __initial_fee: T.Uint256
    ) => {
      const transactionData = {
        isDeploy: true,
        ...sig,
        data: [
          {
            type: `Uint32`,
            vname: `_scilla_version`,
            value: "0",
          },
          {
            type: `ByStr20`,
            vname: `initial_owner`,
            value: __initial_owner.toSend(),
          },
          {
            type: `Uint256`,
            vname: `initial_fee`,
            value: __initial_fee.toSend(),
          },
        ],
      };
      return {
        /**
         * get data needed to perform this transaction
         * */
        toJSON: () => transactionData,
        /**
         * send the transaction to the blockchain
         * */
        send: async () =>
          dangerousFromJSONDeploy(txLink)(resolvers)(transactionData, gasLimit),
      };
    },

    state: <
      E extends "true" | "false",
      Query extends ContractSubStateQueryCast<
        | "pools"
        | "balances"
        | "total_contributions"
        | "output_after_fee"
        | "owner"
        | "pending_owner"
      >
    >(
      query: Query,
      includeInit: E
    ) => ({
      get: (...contractAddresses: T.ByStr20[]) =>
        partialState(async () => {
          return (await getZil()).zil;
        })<
          typeof query,
          typeof includeInit,
          {
            contractAddress: typeof contractAddresses[0];
            includeInit: typeof includeInit;
            query: typeof query;
          },
          { initial_owner: any; initial_fee: any }
        >(
          ...contractAddresses.map((c) => ({
            contractAddress: c,
            includeInit,
            query,
          }))
        ),
    }),

    /**
     * interface for scilla contract with source code hash:
     * 0x5bb178536ac7f3a49daf721f01377930f73d946fa3b50721acc2be9d00b40e34
     */
    calls: (a: T.ByStr20) => (gasLimit: Long) => {
      const signer = signTransition(a);
      return {
        SetFee: (__new_fee: T.Uint256) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SetFee`,
            data: [
              {
                type: `Uint256`,
                vname: `new_fee`,
                value: __new_fee.toSend(),
              },
            ],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        TransferOwnership: (__new_owner: T.ByStr20) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `TransferOwnership`,
            data: [
              {
                type: `ByStr20`,
                vname: `new_owner`,
                value: __new_owner.toSend(),
              },
            ],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        AcceptPendingOwnership: () => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `AcceptPendingOwnership`,
            data: [],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        AddLiquidity: (
          amount: T.Uint128,
          __token_address: T.ByStr20,
          __min_contribution_amount: T.Uint128,
          __max_token_amount: T.Uint128,
          __deadline_block: T.BNum
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `AddLiquidity`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_contribution_amount`,
                value: __min_contribution_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `max_token_amount`,
                value: __max_token_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
            ],
            amount: amount.value.toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        RemoveLiquidity: (
          __token_address: T.ByStr20,
          __contribution_amount: T.Uint128,
          __min_zil_amount: T.Uint128,
          __min_token_amount: T.Uint128,
          __deadline_block: T.BNum
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `RemoveLiquidity`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `contribution_amount`,
                value: __contribution_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_zil_amount`,
                value: __min_zil_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_token_amount`,
                value: __min_token_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
            ],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapExactZILForTokens: (
          amount: T.Uint128,
          __token_address: T.ByStr20,
          __min_token_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapExactZILForTokens`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_token_amount`,
                value: __min_token_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: amount.value.toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapExactTokensForZIL: (
          amount: T.Uint128,
          __token_address: T.ByStr20,
          __token_amount: T.Uint128,
          __min_zil_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapExactTokensForZIL`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `token_amount`,
                value: __token_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_zil_amount`,
                value: __min_zil_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: amount.value.toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapZILForExactTokens: (
          amount: T.Uint128,
          __token_address: T.ByStr20,
          __token_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapZILForExactTokens`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `token_amount`,
                value: __token_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: amount.value.toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapTokensForExactZIL: (
          amount: T.Uint128,
          __token_address: T.ByStr20,
          __max_token_amount: T.Uint128,
          __zil_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapTokensForExactZIL`,
            data: [
              {
                type: `ByStr20`,
                vname: `token_address`,
                value: __token_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `max_token_amount`,
                value: __max_token_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `zil_amount`,
                value: __zil_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: amount.value.toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapExactTokensForTokens: (
          __token0_address: T.ByStr20,
          __token1_address: T.ByStr20,
          __token0_amount: T.Uint128,
          __min_token1_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapExactTokensForTokens`,
            data: [
              {
                type: `ByStr20`,
                vname: `token0_address`,
                value: __token0_address.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `token1_address`,
                value: __token1_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `token0_amount`,
                value: __token0_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `min_token1_amount`,
                value: __min_token1_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },

        SwapTokensForExactTokens: (
          __token0_address: T.ByStr20,
          __token1_address: T.ByStr20,
          __max_token0_amount: T.Uint128,
          __token1_amount: T.Uint128,
          __deadline_block: T.BNum,
          __recipient_address: T.ByStr20
        ) => {
          const transactionData = {
            isDeploy: false,
            ...sig,
            contractAddress: a.toSend(),
            contractTransitionName: `SwapTokensForExactTokens`,
            data: [
              {
                type: `ByStr20`,
                vname: `token0_address`,
                value: __token0_address.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `token1_address`,
                value: __token1_address.toSend(),
              },
              {
                type: `Uint128`,
                vname: `max_token0_amount`,
                value: __max_token0_amount.toSend(),
              },
              {
                type: `Uint128`,
                vname: `token1_amount`,
                value: __token1_amount.toSend(),
              },
              {
                type: `BNum`,
                vname: `deadline_block`,
                value: __deadline_block.toSend(),
              },
              {
                type: `ByStr20`,
                vname: `recipient_address`,
                value: __recipient_address.toSend(),
              },
            ],
            amount: new BN(0).toString(),
          };
          return {
            /**
             * get data needed to perform this transaction
             * */
            toJSON: () => transactionData,
            /**
             * send the transaction to the blockchain
             * */
            send: async () =>
              dangerousFromJSONCall(txLink)(resolvers)(
                transactionData,
                gasLimit
              ),
          };
        },
      };
    },
  };
};
