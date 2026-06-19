#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; int32_t x; } switchWhile_state;

static void switchWhile_poll(switchWhile_state *self) {
    switch (self->_state) {
        case 0:
            if (self->x == 1) {
                int32_t i = 0;
                while (i < 10) {
                i = i + 1;
                if (i == 3) break;
                }
                self->_result = i;
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
