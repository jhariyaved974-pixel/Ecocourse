import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertTriangle, ShoppingBag } from 'lucide-react';
import { requireStaffPage, roleAllowed, ROLE_GROUPS } from '@/lib/auth';
import { asOrderStatus, asPaymentMethod, asPaymentStatus, listOrders, sanitizeSearch, type OrderListFilters } from '@/lib/admin/orders';
import {
  firstParam,
  ORDER_STATUS_TEXT,
  OrderStatusBadge,
  PageHeader,
  Pagination,
  parsePage,
  PAYMENT_STATUS_TEXT,
  PaymentStatusBadge,
  Table,
  TableWrap,
  Td,
  Th,
} from '@/components/admin/ui';
import { SearchParamInput, SearchParamSelect } from '@/components/admin/client-ui';
import { EmptyState, Notice } from '@/components/ui/misc';
import { ExpireOrdersButton } from '@/components/admin/orders/order-actions';
import { ORDER_STATUSES, PAYMENT_METHOD_TEXT, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/components/admin/orders/constants';
import { formatDateTime, formatMoney } from '@/lib/utils';

export const metadata: Metadata = { title: 'Orders' };

function Filters() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <SearchParamInput placeholder="Search number, email, phone or name" className="relative block w-full max-w-[300px]" />
      <SearchParamSelect
        param="status"
        label="Order status"
        options={[{ value: '', label: 'All order statuses' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_TEXT[s] }))]}
      />
      <SearchParamSelect
        param="payment"
        label="Payment status"
        options={[{ value: '', label: 'All payment statuses' }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_TEXT[s] }))]}
      />
      <SearchParamSelect
        param="method"
        label="Payment method"
        options={[{ value: '', label: 'All methods' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_TEXT[m] }))]}
      />
      <SearchParamSelect
        param="attention"
        label="Attention"
        options={[
          { value: '', label: 'Any flag' },
          { value: '1', label: 'Needs attention' },
        ]}
      />
      <SearchParamSelect
        param="sort"
        label="Sort by date"
        options={[
          { value: '', label: 'Newest first' },
          { value: 'oldest', label: 'Oldest first' },
        ]}
      />
    </div>
  );
}

function FiltersFallback() {
  return (
    <div className="mb-4 flex flex-wrap gap-2" aria-hidden>
      <div className="h-9 w-full max-w-sm rounded-full border border-line-strong bg-surface" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-9 w-36 rounded-full border border-line-strong bg-surface" />
      ))}
    </div>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const staff = await requireStaffPage(ROLE_GROUPS.orders);
  const isAdmin = roleAllowed(staff.role, ROLE_GROUPS.admin);
  const sp = await searchParams;
  const filters: OrderListFilters = {
    q: sanitizeSearch(firstParam(sp.q)),
    orderStatus: asOrderStatus(firstParam(sp.status)),
    paymentStatus: asPaymentStatus(firstParam(sp.payment)),
    paymentMethod: asPaymentMethod(firstParam(sp.method)),
    attention: firstParam(sp.attention) === '1',
    sort: firstParam(sp.sort) === 'oldest' ? 'oldest' : 'newest',
    page: parsePage(sp.page),
  };
  const result = await listOrders(filters);
  const filtered = Boolean(filters.q || filters.orderStatus || filters.paymentStatus || filters.paymentMethod || filters.attention);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order with its payment and fulfilment status. Open an order to update fulfilment, add notes or manage cancellations and refunds."
        actions={isAdmin ? <ExpireOrdersButton /> : null}
      />
      <Suspense fallback={<FiltersFallback />}>
        <Filters />
      </Suspense>
      {result.failed ? (
        <Notice tone="danger" title="Orders could not be loaded">Refresh the page. If this keeps happening, check the database connection.</Notice>
      ) : result.outOfRange ? (
        <EmptyState
          icon={<ShoppingBag className="size-5" />}
          title="This page is empty"
          description="There are fewer results than this page number."
          action={<Link href="/admin/orders" className="text-sm font-medium underline">Back to the first page</Link>}
        />
      ) : result.rows.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="size-5" />}
          title={filtered ? 'No orders match these filters' : 'No orders yet'}
          description={filtered ? 'Clear a filter or try another search.' : 'Orders appear here as soon as customers check out.'}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">
            {result.total} order{result.total === 1 ? '' : 's'}
          </p>
          <TableWrap>
            <Table className="min-w-[980px]">
              <thead>
                <tr>
                  <Th>Order</Th>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th className="text-right">Items</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Method</Th>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-2/50">
                    <Td className="whitespace-nowrap">
                      <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs font-semibold hover:underline">
                        {o.orderNumber}
                      </Link>
                      {o.requiresAttention ? (
                        <span className="mt-1 flex max-w-[220px] items-start gap-1 text-[11px] whitespace-normal text-danger" title={o.attentionReason ?? undefined}>
                          <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden /> {o.attentionReason ?? 'Needs attention'}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-xs whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</Td>
                    <Td className="min-w-[200px]">
                      <p className="font-medium">{o.customerName}</p>
                      <p className="text-xs break-words text-muted">{o.email}</p>
                      <p className="text-xs text-muted">{o.phone}</p>
                    </Td>
                    <Td className="text-right tabular-nums">{o.itemCount}</Td>
                    <Td className="text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(o.total)}</Td>
                    <Td className="text-xs whitespace-nowrap">{PAYMENT_METHOD_TEXT[o.paymentMethod]}</Td>
                    <Td>
                      <PaymentStatusBadge status={o.paymentStatus} />
                    </Td>
                    <Td>
                      <OrderStatusBadge status={o.orderStatus} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination
            page={filters.page}
            pageCount={result.pageCount}
            basePath="/admin/orders"
            params={{
              q: filters.q || undefined,
              status: filters.orderStatus,
              payment: filters.paymentStatus,
              method: filters.paymentMethod,
              attention: filters.attention ? '1' : undefined,
              sort: filters.sort === 'oldest' ? 'oldest' : undefined,
            }}
          />
        </>
      )}
    </>
  );
}
