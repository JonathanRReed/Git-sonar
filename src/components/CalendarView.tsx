import { useMemo } from 'react';
import { useGraphStore } from '@lib/store/graph-store';
import { hexToRgba } from '@lib/utils/color';

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function formatRange(start: Date, end: Date) {
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export function CalendarView() {
  const { nodes, theme, viewMode } = useGraphStore();

  const calendar = useMemo(() => {
    if (nodes.length === 0) {
      return {
        weeks: [],
        maxCount: 0,
        rangeLabel: '',
        totalCommits: 0,
      };
    }

    const times = nodes.map((node) => node.commit.authoredAt).filter(Number.isFinite);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const start = startOfWeek(new Date(minTime));
    const end = startOfWeek(new Date(maxTime));
    end.setDate(end.getDate() + 7);

    const dayCounts = new Map<number, number>();
    for (const node of nodes) {
      const day = startOfDay(new Date(node.commit.authoredAt)).getTime();
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }

    const weeks: { date: Date; days: { date: Date; count: number }[] }[] = [];
    let cursor = new Date(start);
    let maxCount = 0;

    while (cursor <= end) {
      const weekStart = new Date(cursor);
      const days = Array.from({ length: 7 }, (_, idx) => {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + idx);
        const count = dayCounts.get(dayDate.getTime()) ?? 0;
        if (count > maxCount) maxCount = count;
        return { date: dayDate, count };
      });
      weeks.push({ date: weekStart, days });
      cursor.setDate(cursor.getDate() + 7);
    }

    return {
      weeks,
      maxCount,
      rangeLabel: formatRange(start, new Date(maxTime)),
      totalCommits: nodes.length,
    };
  }, [nodes]);

  if (viewMode !== 'calendar') return null;

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <div>
          <h2>Calendar View</h2>
          <p>{calendar.rangeLabel}</p>
        </div>
        <div className="calendar-stats">
          <span>{calendar.totalCommits.toLocaleString()} commits</span>
        </div>
      </div>

      <div className="calendar-grid" role="grid" aria-label="Commit calendar">
        <div className="calendar-months">
          {calendar.weeks.map((week, index) => {
            const label = formatMonth(week.date);
            const prevLabel = index > 0 ? formatMonth(calendar.weeks[index - 1].date) : null;
            if (label === prevLabel) return <span key={week.date.toISOString()} />;
            return <span key={week.date.toISOString()}>{label}</span>;
          })}
        </div>
        <div className="calendar-weeks">
          {calendar.weeks.map((week) => (
            <div key={week.date.toISOString()} className="calendar-week" role="row">
              {week.days.map((day) => {
                const intensity = calendar.maxCount > 0 ? day.count / calendar.maxCount : 0;
                const alpha = day.count === 0 ? 0.08 : 0.2 + intensity * 0.6;
                return (
                  <div
                    key={day.date.toISOString()}
                    role="gridcell"
                    className="calendar-cell"
                    title={`${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}: ${day.count} commits`}
                    style={{ backgroundColor: hexToRgba(theme.colors.foam, alpha) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="calendar-legend">
        <span>Less</span>
        <div className="legend-scale">
          {[0.08, 0.2, 0.4, 0.6, 0.8].map((alpha) => (
            <span key={alpha} style={{ backgroundColor: hexToRgba(theme.colors.foam, alpha) }} />
          ))}
        </div>
        <span>More</span>
      </div>

      <style>{`
        .calendar-view {
          position: absolute;
          top: 5.5rem;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 2rem 2.5rem 2.5rem;
          color: var(--rp-text);
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          background: linear-gradient(
            180deg,
            rgba(var(--rp-base-rgb), 0.98) 0%,
            rgba(var(--rp-base-rgb), 0.94) 100%
          );
          z-index: 6;
          overflow: auto;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 1.5rem;
        }

        .calendar-header h2 {
          margin: 0 0 0.35rem;
          font-size: 1.2rem;
        }

        .calendar-header p {
          margin: 0;
          color: var(--rp-subtle);
          font-size: 0.9rem;
        }

        .calendar-stats {
          font-size: 0.9rem;
          color: var(--rp-foam);
        }

        .calendar-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 1.5rem;
          background: rgba(var(--rp-surface-rgb), 0.85);
          border: 1px solid var(--rp-highlight-low);
          border-radius: 16px;
          overflow-x: auto;
        }

        .calendar-months {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(14px, 1fr);
          gap: 6px;
          font-size: 0.7rem;
          color: var(--rp-subtle);
        }

        .calendar-weeks {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(14px, 1fr);
          gap: 6px;
        }

        .calendar-week {
          display: grid;
          grid-template-rows: repeat(7, 14px);
          gap: 6px;
        }

        .calendar-cell {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background: rgba(156, 207, 216, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .calendar-legend {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--rp-muted);
        }

        .legend-scale {
          display: flex;
          gap: 0.35rem;
        }

        .legend-scale span {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        @media (max-width: 900px) {
          .calendar-view {
            top: 4.75rem;
            padding: 1.5rem;
          }

          .calendar-header {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
