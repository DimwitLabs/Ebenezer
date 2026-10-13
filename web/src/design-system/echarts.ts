import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, LegendComponent, CanvasRenderer]);

export { init };
