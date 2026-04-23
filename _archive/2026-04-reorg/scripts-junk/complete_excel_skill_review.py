"""
Complete EX2024-5-2-SkillReview in Excel via COM, then save.
Run with: python scripts/complete_excel_skill_review.py
"""
from __future__ import annotations

import subprocess
import sys
import time

import win32com.client as win32

PATH = r"c:\Users\evilp\Downloads\Gavin.Knotts-EX2024-5-2-SkillReview.xlsx"

XL_SRC_RANGE = 1
XL_YES = 1
XL_DESCENDING = 2
XL_SORT_ON_VALUES = 0
XL_LOCATION_AS_NEW_SHEET = 1
XL_DATABASE = 1
XL_CELL_TYPE_VISIBLE = 12
XL_FILTER_VALUES = 7
XL_CHART_TYPE_LINE = 4
XL_AVERAGE = -4106
XL_TOTALS_AVG = 1
XL_TOTALS_COUNT = 2
XL_SPARK_COLUMN = 2
XL_ROW_FIELD = 1
XL_COLUMN_FIELD = 3
XL_DATA_FIELD = 4
XL_BAR_CLUSTERED = 57
MSO_CALLOUT = 118


def main() -> int:
    subprocess.run(
        ["taskkill", "/IM", "EXCEL.EXE", "/F"],
        capture_output=True,
        check=False,
    )
    time.sleep(2)

    excel = win32.DispatchEx("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    excel.ScreenUpdating = False

    wb = excel.Workbooks.Open(PATH, ReadOnly=False)

    try:
        keep = {"Sales Data", "Loan Worksheet"}
        for name in ("For Sale By Owner", "PivotTableSheet"):
            try:
                wb.Worksheets(name).Delete()
            except Exception:
                pass

        i = 1
        while i <= wb.Worksheets.Count:
            nm = wb.Worksheets(i).Name
            if nm not in keep:
                try:
                    wb.Worksheets(i).Delete()
                    continue
                except Exception:
                    pass
            i += 1

        ws = wb.Worksheets("Sales Data")
        loan_ws = wb.Worksheets("Loan Worksheet")

        for sh in list(ws.Shapes):
            try:
                sh.Delete()
            except Exception:
                pass
        for lo in list(ws.ListObjects):
            try:
                lo.Delete()
            except Exception:
                pass

        last_row = ws.Cells(ws.Rows.Count, 1).End(-4162).Row
        if last_row < 2:
            raise RuntimeError("Sales Data column A has no data rows")

        body = ws.Range(f"A2:L{last_row}")
        body.Sort(
            Key1=ws.Range(f"A2:A{last_row}"),
            Order1=XL_DESCENDING,
            Header=2,
        )

        data_rng = ws.Range(f"A1:L{last_row}")
        lo = ws.ListObjects.Add(
            SourceType=XL_SRC_RANGE,
            Source=data_rng,
            XlListObjectHasHeaders=XL_YES,
        )
        lo.Name = "SalesData"
        lo.TableStyle = "TableStyleMedium2"
        lo.ShowTableStyleRowStripes = False

        lo.ShowTotals = True
        lo.ListColumns(3).TotalsCalculation = XL_TOTALS_COUNT
        for idx in (5, 6, 9, 10, 12):
            lo.ListColumns(idx).TotalsCalculation = XL_TOTALS_AVG

        lo.Range.AutoFilter(Field=2, Criteria1="By Owner")
        lo.Range.AutoFilter(
            Field=5,
            Operator=XL_FILTER_VALUES,
            Criteria1=("3", "4"),
        )

        date_rng = lo.ListColumns(1).DataBodyRange
        price_rng = lo.ListColumns(9).DataBodyRange
        try:
            date_vis = date_rng.SpecialCells(XL_CELL_TYPE_VISIBLE)
            price_vis = price_rng.SpecialCells(XL_CELL_TYPE_VISIBLE)
            src_union = excel.Union(date_vis, price_vis)
        except Exception:
            src_union = excel.Union(date_rng, price_rng)

        co = ws.ChartObjects().Add(Left=400, Top=50, Width=480, Height=320)
        ch = co.Chart
        ch.ChartType = XL_CHART_TYPE_LINE
        ch.SetSourceData(Source=src_union)
        ch.HasTitle = True
        ch.ChartTitle.Text = "For Sale By Owner"

        ser = ch.SeriesCollection(1)
        try:
            ser.ApplyDataLabels(
                Type=2,
                LegendKey=False,
                AutoText=True,
                HasLeaderLines=True,
                ShowSeriesName=False,
                ShowCategoryName=True,
                ShowValue=True,
                ShowPercentage=False,
                ShowBubbleSize=False,
                Separator="",
            )
        except Exception:
            ser.HasDataLabels = True
            ser.DataLabels.ShowValue = True
            ser.DataLabels.ShowCategoryName = True

        try:
            ser.DataLabels.Format.AutoShapeType = MSO_CALLOUT
        except Exception:
            pass

        try:
            ser.HasErrorBars = True
        except Exception:
            pass

        try:
            ch.ChartStyle = 11
        except Exception:
            pass

        ch.Location(Where=XL_LOCATION_AS_NEW_SHEET, Name="For Sale By Owner")

        pvt_ws = wb.Worksheets.Add(After=ws)
        pvt_ws.Name = "PivotTableSheet"

        src_pivot = excel.Union(lo.HeaderRowRange, lo.DataBodyRange)
        pc = wb.PivotCaches().Create(SourceType=XL_DATABASE, SourceData=src_pivot)
        pt = pc.CreatePivotTable(
            TableDestination=pvt_ws.Range("A3"),
            TableName="PTSkillReview",
        )

        pt.PivotFields("Agent").Orientation = XL_ROW_FIELD
        pt.PivotFields("House Type").Orientation = XL_COLUMN_FIELD
        pt.PivotFields("Purchase Price").Orientation = XL_DATA_FIELD
        df = pt.DataFields.Item(1)
        df.Function = XL_AVERAGE
        df.Name = "Average of Purchase Price"

        src_spark = f"'{pvt_ws.Name}'!B5:E9"
        pvt_ws.Range("G5:G9").SparklineGroups.Add(XL_SPARK_COLUMN, src_spark)

        pt_rng = pt.TableRange1
        pco = pvt_ws.ChartObjects().Add(
            Left=float(pt_rng.Left) + float(pt_rng.Width) + 20,
            Top=float(pt_rng.Top),
            Width=420,
            Height=260,
        )
        pch = pco.Chart
        pch.ChartType = XL_BAR_CLUSTERED
        pch.SetSourceData(Source=pt_rng)
        pch.HasTitle = True
        pch.ChartTitle.Text = "Average of Purchase Price"

        loan_ws.Range("B5:E25").Table(
            RowInput=loan_ws.Range("C2"),
            ColumnInput=loan_ws.Range("A2"),
        )
        loan_ws.Range("H4").GoalSeek(950, loan_ws.Range("H9"))

        wb.Save()
        print("OK: saved", PATH)
        return 0
    except Exception as e:
        print("ERROR:", e, file=sys.stderr)
        import traceback

        traceback.print_exc()
        try:
            wb.Save()
        except Exception:
            pass
        return 1
    finally:
        excel.DisplayAlerts = True
        wb.Close(SaveChanges=False)
        excel.Quit()
        del excel
        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
