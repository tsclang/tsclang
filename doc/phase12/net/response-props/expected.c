#include "runtime.h"
#include "std/net.h"

typedef struct {
    int32_t _state; bool _done; int _result;
    TscResponse res;
    TscFetchAwaitable _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_fetch_async(STR_LIT("https://example.com"), NULL);
            self->_state = 1;
        case 1:
            tsc_fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            if (!self->_await_0._result.ok) { self->_done = true; return; }
            self->res = self->_await_0._result.value;
            printf("%s\n", self->res.ok ? "true" : "false");
            printf("%d\n", self->res.status);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
