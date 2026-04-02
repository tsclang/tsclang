#include "runtime.h"

typedef struct { int32_t value; } Data;

typedef struct {
    int32_t _state;
    Data _result;
    bool _done;
} fetch_state;

static void fetch_poll(fetch_state *self) {
    switch (self->_state) {
        case 0: {
            Data d = {0};
            d.value = 42;
            self->_result = d;
            self->_done = true;
            return;
        }
    }
}

typedef struct {
    int32_t _state;
    int _result;
    bool _done;
    Data d;
    fetch_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fetch_state){0};
            self->_state = 1;
            /* fall through */
        case 1:
            fetch_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            self->d = self->_await_0._result;
            printf("%d\n", self->d.value);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
