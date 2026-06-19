#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t n; } classify_state;

static void classify_poll(classify_state *self) {
    switch (self->_state) {
        case 0:
            if (self->n == 1) {
                self->_result = 10;
                self->_done = true;
                return;
            } else if (self->n == 2) {
                self->_result = 20;
                self->_done = true;
                return;
            } else {
                self->_result = 0;
                self->_done = true;
                return;
            }
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
