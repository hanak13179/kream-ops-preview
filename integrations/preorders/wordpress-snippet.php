/* Kream: forward every pickup product and customer request to Ops. */
if (!defined('ABSPATH')) { return; }
function kream_ops_preorder_send($orders) {
    if (!$orders) { return true; }
    $response = wp_remote_post('https://imkhosgnkgwchoyrqczw.supabase.co/functions/v1/cake-reservation-ingest', array(
        'timeout' => 12, 'redirection' => 0, 'sslverify' => true,
        'headers' => array('Content-Type' => 'application/json', 'X-Kream-Sync-Token' => '__KREAM_SYNC_TOKEN__'),
        'body' => wp_json_encode(array('version' => 1, 'orders' => array_values($orders)))
    ));
    $ok = !is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200;
    if ($ok) {
        update_option('kream_ops_preorder_last_success', time(), false);
        delete_option('kream_ops_preorder_last_error');
    } else {
        update_option('kream_ops_preorder_last_error', 'Sync failed. HTTP ' . (is_wp_error($response) ? 'connection' : wp_remote_retrieve_response_code($response)), false);
    }
    return $ok;
}
function kream_ops_preorder_payload($id, $forced_status = '') {
    $order = wc_get_order($id);
    if (!$order || $order->get_type() !== 'shop_order') { return null; }
    $items = array();
    foreach ($order->get_items('line_item') as $item) {
        $options = array();
        foreach ($item->get_formatted_meta_data('_', true) as $meta) {
            $label = wp_strip_all_tags((string) $meta->display_key);
            if (preg_match('/size|flavo[u]?r|message|letter|inscription|text|assortment|selection|option|variant|pack|set|크기|사이즈|맛|문구|메시지|메세지|구성|선택|옵션|세트/iu', $label)) {
                $options[] = array('label' => $label, 'value' => wp_strip_all_tags((string) $meta->display_value));
            }
        }
        $items[] = array('name' => wp_strip_all_tags($item->get_name()), 'quantity' => (int) $item->get_quantity(), 'options' => $options);
    }
    $modified = $order->get_date_modified() ?: $order->get_date_created();
    $now = microtime(true);
    return array(
        'id' => (int) $order->get_id(), 'number' => (string) $order->get_order_number(),
        'status' => $forced_status ?: $order->get_status(),
        'pickup_date' => trim((string) $order->get_meta('pickup_date')),
        'pickup_time' => trim((string) $order->get_meta('pickup_time')),
        'pickup_location' => trim((string) $order->get_meta('pickup_location')),
        'customer_note' => $items ? wp_strip_all_tags($order->get_customer_note()) : '', 'items' => $items,
        'modified_at' => gmdate('c', $modified ? $modified->getTimestamp() : time()),
        'exported_at' => gmdate('Y-m-d\TH:i:s', (int) $now) . sprintf('.%06dZ', (int) (($now - floor($now)) * 1000000))
    );
}
function kream_ops_preorder_enqueue($order) {
    if (!($order instanceof WC_Order) || $order->get_type() !== 'shop_order') { return; }
    $id = (int) $order->get_id();
    if (function_exists('as_enqueue_async_action')) {
        if (!function_exists('as_has_scheduled_action') || !as_has_scheduled_action('kream_ops_preorder_one', array($id), 'kream-ops')) {
            as_enqueue_async_action('kream_ops_preorder_one', array($id), 'kream-ops');
        }
    } elseif (!wp_next_scheduled('kream_ops_preorder_one', array($id))) {
        wp_schedule_single_event(time() + 5, 'kream_ops_preorder_one', array($id));
    }
}
add_action('woocommerce_after_order_object_save', 'kream_ops_preorder_enqueue', 100, 1);
add_action('kream_ops_preorder_one', function($id) {
    $payload = kream_ops_preorder_payload($id);
    if ($payload && !kream_ops_preorder_send(array($payload)) && !wp_next_scheduled('kream_ops_preorder_one', array($id))) {
        wp_schedule_single_event(time() + 300, 'kream_ops_preorder_one', array($id));
    }
}, 10, 1);
foreach (array('woocommerce_before_delete_order', 'woocommerce_before_trash_order') as $hook) {
    add_action($hook, function($id) {
        $payload = kream_ops_preorder_payload($id, 'trash');
        if ($payload) { kream_ops_preorder_send(array($payload)); }
    }, 10, 1);
}
add_filter('cron_schedules', function($schedules) {
    $schedules['kream_ops_five_minutes'] = array('interval' => 300, 'display' => 'Kream Ops every five minutes');
    return $schedules;
});
add_action('init', function() {
    if (!function_exists('wc_get_orders')) { return; }
    if (!wp_next_scheduled('kream_ops_preorder_reconcile')) { wp_schedule_event(time() + 60, 'kream_ops_five_minutes', 'kream_ops_preorder_reconcile'); }
    if (!get_option('kream_ops_preorder_backfill_done') && !wp_next_scheduled('kream_ops_preorder_backfill')) { wp_schedule_single_event(time() + 5, 'kream_ops_preorder_backfill'); }
});
function kream_ops_preorder_batch($backfill) {
    if (!function_exists('wc_get_orders')) { return; }
    $state = $backfill ? array() : get_option('kream_ops_preorder_incremental_state', array());
    if (!$backfill && empty($state)) {
        $state = array('page' => 1, 'start' => max(time() - 7 * DAY_IN_SECONDS, (int) get_option('kream_ops_preorder_cursor', time() - DAY_IN_SECONDS) - 300), 'end' => time());
        update_option('kream_ops_preorder_incremental_state', $state, false);
    }
    $page = $backfill ? max(1, (int) get_option('kream_ops_preorder_backfill_page', 1)) : max(1, (int) $state['page']);
    $query = array('type' => 'shop_order', 'limit' => 40, 'page' => $page, 'paginate' => true, 'orderby' => 'ID', 'order' => 'DESC', 'status' => array_keys(wc_get_order_statuses()));
    if ($backfill) { $query['meta_query'] = array(array('key' => 'pickup_date', 'value' => wp_date('Y-m-d', time() - 7 * DAY_IN_SECONDS), 'compare' => '>=', 'type' => 'DATE')); }
    else { $query['date_modified'] = $state['start'] . '...' . $state['end']; }
    $result = wc_get_orders($query);
    $orders = array();
    foreach ($result->orders as $order) {
        $payload = kream_ops_preorder_payload($order->get_id());
        if (!$payload) { continue; }
        if (!$backfill || $payload['pickup_date'] >= gmdate('Y-m-d', time() - 7 * DAY_IN_SECONDS) || (!$payload['pickup_date'] && $order->get_date_created()->getTimestamp() >= time() - 14 * DAY_IN_SECONDS)) { $orders[] = $payload; }
    }
    if (!kream_ops_preorder_send($orders)) { return; }
    if ($backfill) {
        if ($page < (int) $result->max_num_pages) {
            update_option('kream_ops_preorder_backfill_page', $page + 1, false);
            if (!wp_next_scheduled('kream_ops_preorder_backfill')) { wp_schedule_single_event(time() + 5, 'kream_ops_preorder_backfill'); }
        } else { update_option('kream_ops_preorder_backfill_done', true, false); }
    } elseif ($page < (int) $result->max_num_pages) {
        $state['page'] = $page + 1;
        update_option('kream_ops_preorder_incremental_state', $state, false);
        if (!wp_next_scheduled('kream_ops_preorder_continue')) { wp_schedule_single_event(time() + 5, 'kream_ops_preorder_continue'); }
    } else {
        update_option('kream_ops_preorder_cursor', $state['end'], false);
        delete_option('kream_ops_preorder_incremental_state');
    }
}
add_action('kream_ops_preorder_backfill', function() { kream_ops_preorder_batch(true); });
add_action('kream_ops_preorder_reconcile', function() { kream_ops_preorder_batch(false); });
add_action('kream_ops_preorder_continue', function() { kream_ops_preorder_batch(false); });
add_action('admin_menu', function() {
    add_management_page('Kream Ops order connection', 'Kream Ops order connection', 'manage_woocommerce', 'kream-ops-preorders', function() {
        if (!current_user_can('manage_woocommerce')) { return; }
        if (isset($_POST['kream_ops_sync_now'])) {
            check_admin_referer('kream_ops_sync_now');
            delete_option('kream_ops_preorder_backfill_done');
            update_option('kream_ops_preorder_backfill_page', 1, false);
            kream_ops_preorder_batch(true);
        }
        echo '<div class="wrap"><h1>Kream Ops order connection</h1><p>Only order reference, pickup location/date/time, product details and customer messages are sent to Kream Ops. Customer contact, address and payment details are excluded.</p>';
        $last = (int) get_option('kream_ops_preorder_last_success');
        echo '<p>Last successful sync: ' . esc_html($last ? wp_date('Y-m-d H:i:s', $last) : 'Not connected yet') . '</p>';
        echo '<p>' . esc_html(get_option('kream_ops_preorder_last_error', '')) . '</p>';
        echo '<form method="post">'; wp_nonce_field('kream_ops_sync_now');
        submit_button('Sync upcoming orders now', 'primary', 'kream_ops_sync_now');
        echo '</form></div>';
    });
});
