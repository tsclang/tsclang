#include "runtime.h"
#include "std/net.h"

typedef struct {
    int32_t _state; int _result; bool _done;
    TscResponse res;
    TscFetchAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0: {
            TscFetchOptions _opts_0 = { .method = STR_LIT("POST"), .body = STR_LIT("data") };
            self->_await_0 = tsc_fetch_async(STR_LIT("https://example.com"), &_opts_0);
            self->_state = 1;
            /* fall through */
        }
        case 1:
            tsc_fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            if (!self->_await_0._result.ok) { self->_done = true; return; }
            self->res = self->_await_0._result.value;
            printf("%d\n", self->res.status);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
