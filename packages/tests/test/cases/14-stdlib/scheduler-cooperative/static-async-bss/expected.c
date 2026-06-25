#include "runtime.h"

typedef struct { int32_t _state; int _result; bool _done; } ledBlink_state;

static void ledBlink_poll(ledBlink_state *self) {
    switch (self->_state) {
        case 0:
            printf("blink\n");
            self->_done = true;
            return;
    }
}

static ledBlink_state _ledBlink_instance;

int main(void) {
    TSC_INIT();
    while (!_ledBlink_instance._done) {
        ledBlink_poll(&_ledBlink_instance);
    }
    return 0;
}
