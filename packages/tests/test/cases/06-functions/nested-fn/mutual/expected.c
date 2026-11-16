#include "runtime.h"

static String _nested_1_ping(void *_env, int32_t n);
static String _nested_2_pong(void *_env, int32_t n);

static String _nested_1_ping(void *_env, int32_t n) {
    tsc_closure pong = {.env = NULL, .fn = (void*)_nested_2_pong};
    return (n == 0) ? STR_LIT("done") : ((String (*)(void *, int32_t))pong.fn)(pong.env, n - 1);
}

static String _nested_2_pong(void *_env, int32_t n) {
    tsc_closure ping = {.env = NULL, .fn = (void*)_nested_1_ping};
    return ((String (*)(void *, int32_t))ping.fn)(ping.env, n);
}

void _tsc_main(void) {
    tsc_closure ping = {.env = NULL, .fn = (void*)_nested_1_ping};
    tsc_closure pong = {.env = NULL, .fn = (void*)_nested_2_pong};
    printf("%s\n", ((String (*)(void *, int32_t))ping.fn)(ping.env, 2).data);
}

int main(void) {
    TSC_INIT();
    _tsc_main();
    return 0;
}
