import { Behavior, combineObject } from "@aelea/core"
import { $element, $text, component, style } from "@aelea/dom"
import { $column, $row, layoutSheet, screenUtils } from "@aelea/ui-components"
import { pallete } from "@aelea/ui-components-theme"
import { awaitPromises, empty, map, startWith } from "@most/core"
import { Stream } from "@most/types"
import { IntervalTime, getBasisPoints, getMappedValue, groupArrayMany, pagingQuery, readablePercentage, switchMap, unixTimestampNow } from "common-utils"
import { IPriceTickListMap } from "gmx-middleware-utils"
import { IMirrorPositionListSummary, IMirrorPositionOpen, IMirrorPositionSettled, ISetRouteType, accountSettledPositionListSummary, openPositionListPnl, queryTraderPositionOpen, queryTraderPositionSettled } from "puppet-middleware-utils"
import { ISortBy, ScrollRequest, TableColumn, TablePageResponse } from "ui-components"
import { uiStorage } from "ui-storage"
import * as viem from "viem"
import { $labelDisplay } from "ui-components"
import { $TraderDisplay, $TraderRouteDisplay, $pnlDisplay, $route, $size } from "../../common/$common.js"
import { $card2, $responsiveFlex } from "../../common/elements/$common.js"
import { $LastAtivity, LAST_ACTIVITY_LABEL_MAP } from "../../components/$LastActivity.js"
import { $CardTable } from "../../components/$common"
import { $DropMultiSelect } from "../../components/form/$Dropdown.js"
import { IChangeSubscription } from "../../components/portfolio/$RouteSubscriptionEditor"
import { $tableHeader } from "../../components/table/$TableColumn.js"
import { $ProfilePerformanceGraph } from "../../components/trade/$ProfilePerformanceGraph.js"
import * as storeDb from "../../const/store.js"
import { $seperator2 } from "../common.js"
import { IUserActivityPageParams } from "../type.js"




type ITableRow = {
  summary: IMirrorPositionListSummary
  account: viem.Address
  openPositionList: IMirrorPositionOpen[]
  settledPositionList: IMirrorPositionSettled[]
  positionList: (IMirrorPositionSettled | IMirrorPositionOpen)[]
  pricefeedMap: IPriceTickListMap
}


export const $Leaderboard = (config: IUserActivityPageParams) => component((
  [modifySubscriber, modifySubscriberTether]: Behavior<IChangeSubscription>,
  
  [scrollRequest, scrollRequestTether]: Behavior<ScrollRequest>,
  [sortByChange, sortByChangeTether]: Behavior<ISortBy>,

  [changeActivityTimeframe, changeActivityTimeframeTether]: Behavior<IntervalTime>,
  [selectTradeRouteList, selectTradeRouteListTether]: Behavior<ISetRouteType[]>,

  [routeChange, routeChangeTether]: Behavior<any, string>,
  [switchIsLong, switchIsLongTether]: Behavior<boolean | null>,
) => {

  const { activityTimeframe, selectedTradeRouteList, walletClientQuery, priceTickMapQuery, route, routeTypeListQuery  } = config

  const sortBy = uiStorage.replayWrite(storeDb.store.leaderboard, sortByChange, 'sortBy')
  const isLong = uiStorage.replayWrite(storeDb.store.leaderboard, switchIsLong, 'isLong')


  const pageParms = map(params => {
    const requestPage = { ...params.sortBy, offset: 0, pageSize: 20 }
    const page = startWith(requestPage, scrollRequest)
    const openPositionListQuery = queryTraderPositionOpen({})
    const settledPositionListQuery = queryTraderPositionSettled({ activityTimeframe: params.activityTimeframe })


    const dataSource: Stream<TablePageResponse<ITableRow>> = awaitPromises(map(async reqParams => {
      const openPositionList = await reqParams.openPositionListQuery
      const settledPositionList = await reqParams.settledPositionListQuery
      const pricefeedMap = await params.priceTickMapQuery
      const allPositionList = [...openPositionList, ...settledPositionList]
      const filterStartTime = unixTimestampNow() - params.activityTimeframe

      const filteredList = allPositionList.filter(mp => {
        if (params.isLong !== null && params.isLong !== mp.position.isLong) {
          return false
        }

        if (params.selectedTradeRouteList.length && params.selectedTradeRouteList.findIndex(rt => rt.routeTypeKey === mp.routeTypeKey) === -1) {
          return false
        }

        if (mp.__typename === 'MirrorPositionOpen') {
          return true
        }

        return mp.blockTimestamp > filterStartTime
      })
      const tradeListMap = groupArrayMany(filteredList, a => a.tradeRouteKey)
      const tradeListEntries = Object.values(tradeListMap)
      const filterestPosList: ITableRow[] = tradeListEntries.map(positionList => {
        const summary = accountSettledPositionListSummary(positionList)
        const openPositionList = positionList.filter(mp => mp.__typename === 'MirrorPositionOpen') as IMirrorPositionOpen[]
        const settledPositionList = positionList.filter(mp => mp.__typename === 'MirrorPositionSettled') as IMirrorPositionSettled[]

        return { account: positionList[0].trader, summary, openPositionList, settledPositionList, positionList, pricefeedMap }
      })

      return pagingQuery({ ...reqParams.page, ...reqParams }, filterestPosList)
    }, combineObject({ page, openPositionListQuery, settledPositionListQuery })))


    return { ...params, dataSource }
  }, combineObject({ sortBy, activityTimeframe, selectedTradeRouteList, isLong, priceTickMapQuery }))




  return [
    $column(layoutSheet.spacing, style({ paddingTop: '36px' }))(

      $card2(style({ padding: "0", gap: 0 }))(
        $responsiveFlex(layoutSheet.spacingBig, style({ padding: '26px', placeContent: 'space-between', alignItems: 'flex-start' }))(
          $DropMultiSelect({
          // $container: $row(layoutSheet.spacingTiny, style({ display: 'flex', position: 'relative' })),
            $input: $element('input')(style({ width: '100px' })),
            $label: $labelDisplay(style({ color: pallete.foreground }))('Route'),
            placeholder: 'All / Select',
            getId: item => item.routeTypeKey,
            $$chip: map(tr => $route(tr, false)),
            selector: {
              list: awaitPromises(routeTypeListQuery),
              $$option: map(tr => {
                return style({
                  padding: '8px'
                }, $route(tr, true))
              })
            },
            value: selectedTradeRouteList
          })({
            select: selectTradeRouteListTether()
          }),

          // $ButtonToggle({
          //   // $container: $row(layoutSheet.spacingSmall),
          //   selected: isLong,
          //   options: [
          //     null,
          //     true,
          //     false,
          //   ],
          //   $$option: map(il => {
          //     return $row(layoutSheet.spacingTiny, style({ alignItems: 'center' }))(
          //       il === null
          //         ? empty()
          //         : $icon({ $content: il ? $bull : $bear, width: '18px', viewBox: '0 0 32 32' }),
          //       $text(il === null ? 'All' : il ? 'Long' : 'Short'),
          //     )
          //   })
          // })({
          //   select: switchIsLongTether()
          // }),

          // $Popover({
          //   $target: $ButtonSecondary({
          //     $container: $defaultMiniButtonSecondary,
          //     $content: $text('Filter'),
          //   })({
          //     click: openFilterPopoverTether()
          //   }),
          //   $popContent: map(() => {

          //     return $column(layoutSheet.spacingBig, style({ width: '410px' }))(
          //       $row(
          //         $DropMultiSelect({
          //           $label: $labelDisplay(style({ color: pallete.foreground }))('Route'),
          //           placeholder: 'All / Select',
          //           $$chip: map(rt => {
          //             return $route(rt)
          //           }),
          //           selector: {
          //             list: ROUTE_DESCRIPTION,
          //             $$option: map(route => {
          //               return style({
          //                 padding: '8px'
          //               }, $route(route))
          //             })
          //           },
          //           value: routeList
          //         })({
          //           select: routeTypeChangeTether()
          //         }),
          //       )
          //     )
          //   }, openFilterPopover)
          // })({}),
          
          $LastAtivity(activityTimeframe)({
            changeActivityTimeframe: changeActivityTimeframeTether()
          }),
        ),
        switchMap(params => {

          const columns: TableColumn<ITableRow>[] = [
            {
              $head: $text('Trade Route'),
              gridTemplate: screenUtils.isDesktopScreen ? '114px' : '114px',
              // columnOp: style({ placeContent: 'flex-end' }),
              $bodyCallback: map(pos => {

                return $TraderRouteDisplay({
                  walletClientQuery,
                  summary: pos.summary,
                  trader: pos.account,
                  tradeRoute: pos.positionList[0].tradeRoute,
                  positionParams: pos.positionList[0].position,
                  routeTypeKey: pos.positionList[0].routeTypeKey,
                })({
                  modifySubscribeList: modifySubscriberTether()
                })
              })
            },
            {
              $head: $text('Trader'),
              gridTemplate: 'minmax(95px, 100px)',
              columnOp: style({ alignItems: 'center' }),
              $bodyCallback: map(pos => {

                return $TraderDisplay({
                  route: config.route,
                  trader: pos.account,
                })({ 
                  click: routeChangeTether()
                })
              })
            },
            
            
            ...screenUtils.isDesktopScreen
              ? [
              // {
              //   $head: $text('Puppets'),
              //   gridTemplate: '90px',
              //   $bodyCallback: map((pos: ITableRow) => {
              //     return $puppets(pos.summary.puppets, routeChangeTether)
              //   })
              // },
                {
                  $head: $text('Win / Loss'),
                  gridTemplate: '90px',
                  columnOp: style({ alignItems: 'center', placeContent: 'center' }),
                  $bodyCallback: map((pos: ITableRow) => {
                    return $row(
                      $text(`${pos.summary.winCount} / ${pos.summary.lossCount}`)
                    )
                  })
                },
              ]
              : [],
            {
              $head: $column(style({ textAlign: 'right' }))(
                $text('Size'),
                $text(style({ fontSize: '.85rem' }))('Leverage'),
              ),
              sortBy: 'size',
              columnOp: style({ placeContent: 'flex-end' }),
              $bodyCallback: map((pos) => {
                return $size(pos.summary.size, pos.summary.collateral)
              })
            },
            
            {
              $head: $tableHeader('PnL $', 'ROI %'),
              gridTemplate: screenUtils.isDesktopScreen ? '120px' : '80px',
              sortBy: 'pnl',
              columnOp: style({ placeContent: 'flex-end' }),
              $bodyCallback: map(tr => {
                const pnl = map(openPnl => tr.summary.pnl + openPnl, openPositionListPnl(tr.openPositionList))

                return $column(layoutSheet.spacingTiny, style({ textAlign: 'right' }))(
                  $pnlDisplay(pnl),
                  $seperator2,
                  $text(style({ fontSize: '.85rem' }))(
                    map(pnl => {
                      return readablePercentage(getBasisPoints(pnl, tr.summary.collateral))
                    }, pnl)
                  ),
                )
              })
            },
            
            ...screenUtils.isDesktopScreen
              ? [
                {
                  columnOp: style({ placeContent: 'flex-end' }),
                  $head: $text(`Last ${getMappedValue(LAST_ACTIVITY_LABEL_MAP, params.activityTimeframe)} activity`),
                  gridTemplate: '140px',
                  $bodyCallback: map((pos: ITableRow) => {
                    
                    return screenUtils.isDesktopScreen
                      ? $ProfilePerformanceGraph({
                        $container: $row(style({ position: 'relative',  width: `180px`, height: `80px`, margin: '-16px 0' })),
                        tickCount: 50,
                        priceTickMap: pos.pricefeedMap,
                        openPositionList: pos.openPositionList,
                        settledPositionList: pos.settledPositionList,
                        activityTimeframe: params.activityTimeframe,
                      })({})
                      : empty()
                  })
                },
              ]
              : [],
          ]

          return $CardTable({
            sortBy: params.sortBy,
            dataSource: params.dataSource,
            columns,
          })({
            sortBy: sortByChangeTether(),
            scrollRequest: scrollRequestTether(),
          })
        }, pageParms)
      )
      
    ),

    {
      routeChange,
      modifySubscriber,
      changeActivityTimeframe, selectTradeRouteList,
      // unSubscribeSelectedTraders: snapshot((params, trader) => {
      //   const selectedIdx = params.selection.indexOf(trader)
      //   selectedIdx === -1 ? params.selection.push(trader) : params.selection.splice(selectedIdx, 1)
      //   return params.selection
      // }, combineObject({ selection: config.selectedTraders, subscription: config.subscription }), selectTrader),
    }
  ]
})





