#include "runtime.h"

typedef struct { int32_t _state; String _result; bool _done; } fetch_state;

static void fetch_poll(fetch_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = STR_LIT("hello");
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    String raw;
    String copy;
    fetch_state _await_0;
} process_state;

static void process_poll(process_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fetch_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->raw = self->_await_0._result;
            self->copy = self->raw;
            tsc_string_retain(self->copy);
            printf("%s\n", self->copy.data);
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->raw);
            tsc_string_release(self->copy);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
