#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } counter_state;

static void counter_poll(counter_state *self) {
    switch (self->_state) {
        case 0:
            int32_t x = 0;
            x = (int32_t)((uint32_t)x + (uint32_t)1);
            self->_result = x;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
