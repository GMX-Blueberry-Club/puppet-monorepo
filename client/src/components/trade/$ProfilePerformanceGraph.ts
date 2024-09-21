import { Behavior } from "@aelea/core"
import { $Node, $text, NodeComposeFn, component, style } from "@aelea/dom"
import { $column, $row, layoutSheet } from "@aelea/ui-components"
import { colorAlpha, pallete } from "@aelea/ui-components-theme"
import { now, skipRepeatsWith } from "@most/core"
import { IntervalTime, USD_DECIMALS, createTimeline, formatFixed, getBasisPoints, readablePercentage, unixTimestampNow } from "common-utils"
import { IPositionDecrease, IPositionIncrease, IPricefeedMap, IPricetick, getMarketIndexToken, getPositionPnlUsd, isUpdateDecrease, isUpdateIncrease } from "gmx-middleware-utils"
import { BaselineData, ChartOptions, DeepPartial, LineType, MouseEventParams, Time } from "lightweight-charts"
import { $Baseline, IMarker } from "ui-components"
import * as viem from "viem"
import { $pnlDisplay } from "../../common/$common"
import { $seperator2 } from "../../pages/common"
import { IAccountLastAggregatedStats } from "puppet-middleware-utils"



export interface IPerformanceTimeline {
  pricefeedMap: IPricefeedMap
  activityTimeframe: IntervalTime
  puppet?: viem.Address
  list: (IPositionIncrease | IPositionDecrease)[]
  tickCount: number
  chartConfig?: DeepPartial<ChartOptions>
}

type OpenPnl = {
  update: { sizeInUsd: bigint, sizeInTokens: bigint, isLong: boolean }
  indexToken: viem.Address
  pnl: bigint
}


type IPricetickWithIndexToken = IPricetick & { indexToken: viem.Address }


function getTime(item: IPositionIncrease | IPositionDecrease | IPricetickWithIndexToken): number {
  return 'price' in item ? item.timestamp : item.blockTimestamp
}

export function getPositionListTimelinePerformance(config: IPerformanceTimeline) {
  if (config.list.length === 0) {
    return []
  }

  const timeNow = unixTimestampNow()
  const startTime = timeNow - config.activityTimeframe
  const initialPositionTime = config.list.map(pos => pos.blockTimestamp).reduce((a, b) => Math.min(a, b), config.list[0].blockTimestamp)
  const uniqueIndexTokenList = [...new Set(config.list.map(update => getMarketIndexToken(update.market)))]
  const priceUpdateTicks: IPricetickWithIndexToken[] = uniqueIndexTokenList
    .flatMap(indexToken =>
      config.pricefeedMap[indexToken].map(x => ({ indexToken, price: x.c, timestamp: x.slotTime })) ?? []
    )
    .filter(tick => tick.timestamp > initialPositionTime)

  const data = createTimeline({
    source: [...config.list, ...priceUpdateTicks],
    seed: {
      value: 0,
      realisedPnl: 0n,
      pnl: 0n,
      openPnlMap: {},
      time: startTime,
    },
    getTime,
    seedMap: (acc, next) => {
      let realisedPnl = acc.realisedPnl
      let openPnl: OpenPnl

      const openPnlMap: Record<viem.Hex, OpenPnl> = acc.openPnlMap

      if ('price' in next) {
        for (const positionKey in openPnlMap) {
          const openPnl = openPnlMap[positionKey as viem.Hex]

          if (next.indexToken === openPnl.indexToken) {
            openPnl.pnl = getPositionPnlUsd(openPnl.update.isLong, openPnl.update.sizeInUsd, openPnl.update.sizeInTokens, next.price)
          }
        }

      } else {
        const indexToken = getMarketIndexToken(next.market)
        openPnl = openPnlMap[next.positionKey] ??= { pnl: 0n, update: next, indexToken }

        if (next.__typename === 'PositionIncrease') {
          openPnl.update = next
          openPnl.pnl = getPositionPnlUsd(openPnl.update.isLong, openPnl.update.sizeInUsd, openPnl.update.sizeInTokens, next.indexTokenPriceMax)
        } else {
          openPnl.update = next
          realisedPnl += next.basePnlUsd

          openPnl.pnl = openPnl.update.sizeInTokens > 0n ? getPositionPnlUsd(openPnl.update.isLong, openPnl.update.sizeInUsd, openPnl.update.sizeInTokens, next.indexTokenPriceMax) : 0n
        }
      }

      const aggregatedOpenPnl = Object.values(openPnlMap).reduce((acc, next) => acc + next.pnl, 0n)
      const pnl = realisedPnl + aggregatedOpenPnl
      const value = formatFixed(USD_DECIMALS, pnl)

      return { openPnlMap, realisedPnl, pnl, value }
    },
  })

  return data
}

export const $ProfilePerformanceGraph = (config: IPerformanceTimeline & { $container: NodeComposeFn<$Node> }) => component((
  [crosshairMove, crosshairMoveTether]: Behavior<MouseEventParams, MouseEventParams>,
) => {

  const timeline = getPositionListTimelinePerformance(config)

  const openMarkerList = config.list.filter(isUpdateIncrease).map((pos): IMarker => {
    const pnl = timeline[timeline.length - 1].value
    return {
      position: 'inBar',
      color: pnl < 0 ? pallete.negative : pallete.positive,
      time: unixTimestampNow() as Time,
      size: 1.5,
      shape: 'circle'
    }
  })

  const settledMarkerList = config.list.filter(isUpdateDecrease).map((pos): IMarker => {
    return {
      position: 'inBar',
      color: colorAlpha(pallete.message, .15),
      time: Number(pos.blockTimestamp) as Time,
      size: 0.1,
      shape: 'circle'
    }
  })

  const allMarkerList = [...settledMarkerList, ...openMarkerList].sort((a, b) => Number(a.time) - Number(b.time))


  return [
    config.$container(
      $Baseline({
        containerOp: style({ inset: '0px 0px 0px 0px', position: 'absolute' }),
        markers: now(allMarkerList),
        chartConfig: {
          width: 100,
          leftPriceScale: {
            // autoScale: true,
            ticksVisible: true,
            scaleMargins: {
              top: 0,
              bottom: 0,
            }
          },
          crosshair: {
            horzLine: {
              visible: false,
            },
            vertLine: {
              visible: false,
            }
          },
          // height: 150,
          // width: 100,
          timeScale: {
            visible: false
          },
          // ...config.chartConfig
        },
        data: timeline as any as BaselineData[],
        // containerOp: style({  inset: '0px 0px 0px 0px' }),
        baselineOptions: {
          baseValue: {
            price: 0,
            type: 'price',
          },
          lineWidth: 1,
          lineType: LineType.Curved,
        },
      })({
        crosshairMove: crosshairMoveTether(
          skipRepeatsWith((a, b) => a.point?.x === b.point?.x)
        )
      }),
    ),

    {
      crosshairMove,
      // requestPricefeed
    }
  ]
})




