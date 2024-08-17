import { Behavior, combineObject } from "@aelea/core"
import { $node, $text, component, style } from "@aelea/dom"
import { $column, $row, layoutSheet } from "@aelea/ui-components"
import { pallete } from "@aelea/ui-components-theme"
import { constant, empty, map } from "@most/core"
import { ADDRESS_ZERO, IntervalTime, applyFactor, countdownFn, factor, getDenominator, getMappedValue, getTimeSince, readableFactorPercentage, readableTokenAmount, readableUnitAmount, readableUsd, switchMap } from "common-utils"
import { EIP6963ProviderDetail } from "mipd"
import * as PUPPET from "puppet-middleware-const"
import { ISetRouteType, queryPuppetTradeRoute, queryTraderPositionOpen, queryTraderPositionSettled } from "puppet-middleware-utils"
import { $ButtonToggle, $defaulButtonToggleContainer, $infoLabeledValue, $infoTooltipLabel, $intermediateMessage } from "ui-components"
import { uiStorage } from "ui-storage"
import { $heading3 } from "../../common/$text"
import { $card, $responsiveFlex } from "../../common/elements/$common"
import { $IntermediateConnectButton } from "../../components/$ConnectWallet.js"
import { $VestingDetails } from "../../components/$VestingDetails"
import { IChangeSubscription } from "../../components/portfolio/$RouteSubscriptionEditor.js"
import * as storeDb from "../../const/store.js"
import {  readPuppetPriceInUsd, } from "../../logic/puppetRead"
import { $seperator2 } from "../common"
import { IPageParams, IUserActivityParams, IWalletTab } from "../type.js"
import { $TraderPage } from "./$Trader.js"
import { $WalletPuppet } from "./$WalletPuppet.js"
import { $ButtonSecondary } from "../../components/form/$Button"
import { getTokenDescription } from "gmx-middleware-utils"
import { ARBITRUM_ADDRESS } from "gmx-middleware-const"
import { readBalanceOf, readLockSupply, readTotalEmitted } from "../../logic/commonRead"
import { subgraphClient } from "../../common/graphClient"

const optionDisplay = {
  [IWalletTab.EARN]: {
    label: 'Earn',
    url: '/earn'
  },
  [IWalletTab.PUPPET]: {
    label: 'Puppet',
    url: '/puppet'
  },
  [IWalletTab.TRADER]: {
    label: 'Trader',
    url: '/trader'
  },
}


export const $WalletPage = (config: IPageParams & IUserActivityParams) => component((
  [changeRoute, changeRouteTether]: Behavior<string, string>,
  [selectProfileMode, selectProfileModeTether]: Behavior<IWalletTab>,
  [modifySubscriber, modifySubscriberTether]: Behavior<IChangeSubscription>,

  [changeActivityTimeframe, changeActivityTimeframeTether]: Behavior<any, IntervalTime>,
  [selectTradeRouteList, selectTradeRouteListTether]: Behavior<ISetRouteType[]>,

  [changeWallet, changeWalletTether]: Behavior<any, EIP6963ProviderDetail | null>,
) => {

  const {
    route, walletClientQuery, routeTypeListQuery, providerClientQuery,
    activityTimeframe, selectedTradeRouteList, priceTickMapQuery 
  } = config

  const profileMode = uiStorage.replayWrite(storeDb.store.wallet, selectProfileMode, 'selectedTab')


  const puppetTokenPriceInUsd = switchMap(async providerQuery => {
    const provider = await providerQuery

    return await readPuppetPriceInUsd(provider)
  }, providerClientQuery)



  return [

    $column(layoutSheet.spacingBig)(
      $node(),

      // $row(style({ flex: 1, placeContent: 'center' }))(
      //   $IntermediateConnectButton({
      //     walletClientQuery,
      //     $$display: map(wallet => {
      //       // return empty()
      //       return $ButtonSecondary({
      //         $content: $text('Disconnect')
      //       })({
      //         click: changeWalletTether(constant(null))
      //       })
      //     })
      //   })({
      //     changeWallet: changeWalletTether()
      //   }),
      // ),

      $row(
        $node(style({ flex: 1 }))(),
        $ButtonToggle({
          $container: $defaulButtonToggleContainer(style({ alignSelf: 'center', })),
          selected: profileMode,
          options: [IWalletTab.EARN, IWalletTab.PUPPET, IWalletTab.TRADER],
          $$option: map(option => {
            return $text(optionDisplay[option].label)
          })
        })({ select: selectProfileModeTether() }),
        $node(style({ flex: 1 }))(),
      ),

      switchMap(params => {
        const address = switchMap(async walletQuery => {
          return (await walletQuery)?.account.address || ADDRESS_ZERO
        }, walletClientQuery)

        if (params.profileMode === IWalletTab.PUPPET) {
          const puppetTradeRouteListQuery = queryPuppetTradeRoute(subgraphClient, { address, activityTimeframe, selectedTradeRouteList })
          
          const settledPositionListQuery = map(async tradeRoute => {
            return (await tradeRoute).map(x => x.settledList).flatMap(pp => pp.map(x => x.position))
          }, puppetTradeRouteListQuery)
          const openPositionListQuery = map(async tradeRoute => {
            return (await tradeRoute).map(x => x.openList).flatMap(pp => pp.map(x => x.position))
          }, puppetTradeRouteListQuery)

          return $WalletPuppet({
            walletClientQuery, route, priceTickMapQuery, openPositionListQuery, settledPositionListQuery, puppetTradeRouteListQuery,
            activityTimeframe, selectedTradeRouteList, routeTypeListQuery, providerClientQuery,
          })({
            changeRoute: changeRouteTether(),
            modifySubscriber: modifySubscriberTether(),
            changeActivityTimeframe: changeActivityTimeframeTether(),
            selectTradeRouteList: selectTradeRouteListTether(),
          })
        } else if (params.profileMode === IWalletTab.TRADER) {
          const settledPositionListQuery = queryTraderPositionSettled(subgraphClient, { activityTimeframe, selectedTradeRouteList, address })
          const openPositionListQuery = queryTraderPositionOpen(subgraphClient, { address, selectedTradeRouteList })

          return $column(layoutSheet.spacingTiny)(
            $TraderPage({ ...config, openPositionListQuery, settledPositionListQuery })({ 
              changeActivityTimeframe: changeActivityTimeframeTether(),
            })
          ) 
        }


        return $card(layoutSheet.spacingBig)(
          
          $responsiveFlex(layoutSheet.spacingBig)(

            $VestingDetails({ ...config, puppetTokenPriceInUsd })({
              changeWallet: changeWalletTether()
            }),
            
            $seperator2,
            $column(layoutSheet.spacing, style({ flex: 1 }))(
              $heading3('Protocol Flywheel'),
              style({ placeContent: 'space-between' })(
                $infoLabeledValue(
                  'Price',
                  $intermediateMessage(
                    map(async puppetPrice => {
                      const price = puppetPrice * getDenominator(24)

                      return readableUsd(price)
                    }, puppetTokenPriceInUsd)
                  )
                )
              ),
              style({ placeContent: 'space-between' })(
                $infoLabeledValue(
                  $infoTooltipLabel('This week revenue amount that will be distributed anyone who locked their PUPPET', 'Current Revenue'),
                  $row(layoutSheet.spacingSmall, style({ alignItems: 'center' }))(
                    $text(style({ color: pallete.foreground, fontSize: '.75rem' }))(`($36,137)`),
                    $text(`21,383 / Week`)
                  ),
                )
              ),
              style({ placeContent: 'space-between' })(
                $infoLabeledValue(
                  $infoTooltipLabel('Total amount of PUPPET that has been emitted over the lifetime of the protocol. Each subsequent year, the number of new tokens minted will decrease by about 16%,', 'Total Emitted'),
                  $intermediateMessage(
                    map(async providerQuery => {
                      const provider = await providerQuery
                      const puppetSupply = readTotalEmitted(provider)

                      return readableTokenAmount(PUPPET.PUPPET_TOKEN_DESCRIPTION, await puppetSupply)
                    }, providerClientQuery)
                  ),
                )
              ),
              // style({ placeContent: 'space-between' })(
              //   $infoLabeledValue(
              //     $infoTooltipLabel('The total value of all PUPPET in circulation', 'Market Cap'),
              //     $text('10,000,000'),
              //   )
              // ),
              $seperator2,
              style({ placeContent: 'space-between' })(
                $infoLabeledValue(
                  $text('Average lock time'),
                  $intermediateMessage(
                    map(async providerQuery => {
                      const provider = await providerQuery
                      const contractMap = getMappedValue(PUPPET.CONTRACT, provider.chain.id)
                      const puppetBalanceInVeContract = readBalanceOf(provider, contractMap.PuppetToken.address, contractMap.VotingEscrow.address)
                      const lockedSupply = readLockSupply(provider)
                      const globalLockFactor = factor(await lockedSupply, await puppetBalanceInVeContract)
                      const globalLockTimespan = applyFactor(globalLockFactor, BigInt(PUPPET.MAX_LOCKUP_SCHEDULE))

                      return countdownFn(PUPPET.MAX_LOCKUP_SCHEDULE, PUPPET.MAX_LOCKUP_SCHEDULE - Number(globalLockTimespan))
                    }, providerClientQuery)
                  ),
                )
              ),
              style({ placeContent: 'space-between' })(
                $infoLabeledValue(
                  $text('Exit / Lock'),
                  $row(layoutSheet.spacingSmall, style({ alignItems: 'center' }))(
                    $text(style({ color: pallete.foreground, fontSize: '.75rem' }))(`(66% Lock)`),
                    $text(`14,112 / 28,654`)
                  ),
                )
              ),
            ),
            
          ),
        )
      }, combineObject({ profileMode }))


    ),

    {
      modifySubscriber, changeActivityTimeframe, selectTradeRouteList, changeRoute, changeWallet
    }
  ]
})


