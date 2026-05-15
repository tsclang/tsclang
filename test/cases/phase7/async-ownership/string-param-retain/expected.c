#include "runtime.h"

typedef struct { int32_t _state; String _result; bool _done; } fetch_state;

static void fetch_poll(fetch_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = STR_LIT("data");
            self->_done = true;
            return;
    }
}

typedef struct { int32_t _state; int _result; bool _done; String name; TscSleepAwaitable _await_0; } greet_state;

static void greet_poll(greet_state *self) {
    switch (self->_state) {
        case 0:
            tsc_string_retain(self->name);
            self->_await_0 = tsc_sleep_awaitable(10);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_sleep_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            printf("%d\n", self->name);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->name);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
