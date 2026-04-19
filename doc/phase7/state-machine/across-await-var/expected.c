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

typedef struct {
    int32_t _state; String _result; bool _done;
    TscResponse raw;
    String result;
    TscFetchAwaitable _await_0;
} process_state;

static void process_poll(process_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = tsc_fetch_async(STR_LIT(""), NULL);
            self->_state = 1;
            /* fall through */
        case 1:
            tsc_fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            if (!self->_await_0._result.ok) { self->_done = true; return; }
            self->raw = self->_await_0._result.value;
            self->result = self->raw + STR_LIT("!");
            self->_result = self->result;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
